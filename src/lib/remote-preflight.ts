import { realSshRunner, type SshRunner } from './ssh-exec';

export type Distro = 'debian' | 'rhel' | 'arch' | 'unknown';

export type PreflightOutcome =
  | { kind: 'ok'; warnings: string[] }
  | { kind: 'shim-missing' }
  | { kind: 'shim-outdated'; remoteHash: string }
  | { kind: 'socat-missing'; distro: Distro }
  | { kind: 'sshd-config-missing' }
  | { kind: 'error'; errors: string[] };

export interface PreflightOptions {
  chromeSocket?: string;
  chromePort?: number;
  expectedShimHash: string;
}

export function buildPreflightScript(
  opts: Pick<PreflightOptions, 'chromeSocket' | 'chromePort'> = {},
): string {
  const sock = opts.chromeSocket ?? '/tmp/mole-chrome.sock';
  const port = opts.chromePort ?? 9222;
  return `
set -eu
MOLE_SLBU_READ=""
for f in /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf; do
  [ -r "$f" ] || continue
  MOLE_SLBU_READ="$MOLE_SLBU_READ $f"
done
if [ -z "$MOLE_SLBU_READ" ]; then
  echo "MOLE_WARN: cannot read /etc/ssh/sshd_config*; unable to verify 'StreamLocalBindUnlink yes'. If clipboard silently fails, check 'ls -la /tmp/mole-*.sock' on remote and ensure sshd_config has 'StreamLocalBindUnlink yes'." >&2
elif ! grep -hEi '^[[:space:]]*StreamLocalBindUnlink[[:space:]]+yes[[:space:]]*$' $MOLE_SLBU_READ >/dev/null 2>&1; then
  echo "ERROR: remote sshd missing 'StreamLocalBindUnlink yes'; a stale -R socket from another client will silently block mole's clipboard. Fix: echo 'StreamLocalBindUnlink yes' | sudo tee -a /etc/ssh/sshd_config && sudo systemctl reload ssh.service" >&2
  exit 3
fi
if ! command -v socat >/dev/null 2>&1; then
  distro="unknown"
  if [ -r /etc/os-release ]; then
    . /etc/os-release
    case "\${ID_LIKE:-\${ID:-}}" in
      *debian*|*ubuntu*) distro="debian" ;;
      *rhel*|*fedora*|*centos*) distro="rhel" ;;
      *arch*) distro="arch" ;;
    esac
  fi
  echo "MOLE_SOCAT_MISSING: $distro" >&2
  exit 1
fi
if [ ! -x "$HOME/.local/bin/xclip" ]; then
  echo "MOLE_SHIM_MISSING:" >&2
  exit 2
fi
remote_hash=$(sha256sum "$HOME/.local/bin/xclip" | cut -c1-12)
echo "MOLE_SHIM_HASH: $remote_hash" >&2
if ! pgrep -f 'socat.*mole-chrome' >/dev/null 2>&1; then
  nohup socat TCP-LISTEN:${port},bind=127.0.0.1,reuseaddr,fork UNIX-CONNECT:${sock} >/dev/null 2>&1 </dev/null &
  sleep 0.2
fi
`.trim();
}

function parseDistro(raw: string): Distro {
  const trimmed = raw.trim();
  if (trimmed === 'debian' || trimmed === 'rhel' || trimmed === 'arch') {
    return trimmed;
  }
  return 'unknown';
}

export async function runPreflightWith(
  host: string,
  runner: SshRunner,
  opts: PreflightOptions,
): Promise<PreflightOutcome> {
  const script = buildPreflightScript(opts);
  const { stderr, code } = await runner(host, script);
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const warnings = lines
    .filter((l) => l.startsWith('MOLE_WARN:'))
    .map((l) => l.replace(/^MOLE_WARN:\s*/, ''));

  const socatLine = lines.find((l) => l.startsWith('MOLE_SOCAT_MISSING:'));
  if (socatLine) {
    const distro = parseDistro(
      socatLine.replace(/^MOLE_SOCAT_MISSING:\s*/, ''),
    );
    return { kind: 'socat-missing', distro };
  }

  if (lines.some((l) => l.startsWith('MOLE_SHIM_MISSING'))) {
    return { kind: 'shim-missing' };
  }

  const hashLine = lines.find((l) => l.startsWith('MOLE_SHIM_HASH:'));
  if (hashLine) {
    const remoteHash = hashLine.replace(/^MOLE_SHIM_HASH:\s*/, '');
    if (remoteHash !== opts.expectedShimHash) {
      return { kind: 'shim-outdated', remoteHash };
    }
    if (code === 0) {
      return { kind: 'ok', warnings };
    }
  }

  if (code === 3) {
    return { kind: 'sshd-config-missing' };
  }

  if (code === 0) {
    return { kind: 'ok', warnings };
  }

  const errors = lines.filter(
    (l) =>
      !l.startsWith('MOLE_WARN:') &&
      !l.startsWith('MOLE_SOCAT_MISSING:') &&
      !l.startsWith('MOLE_SHIM_MISSING') &&
      !l.startsWith('MOLE_SHIM_HASH:'),
  );
  return { kind: 'error', errors };
}

export async function runPreflight(
  host: string,
  opts: PreflightOptions,
): Promise<PreflightOutcome> {
  return runPreflightWith(host, realSshRunner, opts);
}
