import { buildNonInteractiveSshArgs } from './ssh-spawn';

export interface PreflightOptions {
  chromeSocket?: string;
  chromePort?: number;
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function buildPreflightScript(opts: PreflightOptions = {}): string {
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
  echo "ERROR: socat not installed on remote" >&2
  exit 1
fi
if [ ! -x "$HOME/.local/bin/xclip" ]; then
  echo "ERROR: fake xclip not installed at ~/.local/bin/xclip; run remote/install.sh" >&2
  exit 2
fi
if ! pgrep -f 'socat.*mole-chrome' >/dev/null 2>&1; then
  nohup socat TCP-LISTEN:${port},bind=127.0.0.1,reuseaddr,fork UNIX-CONNECT:${sock} >/dev/null 2>&1 </dev/null &
  sleep 0.2
fi
`.trim();
}

export type SshRunner = (
  host: string,
  script: string,
) => Promise<{ stdout: string; stderr: string; code: number }>;

export async function runPreflightWith(
  host: string,
  runner: SshRunner,
  opts: PreflightOptions = {},
): Promise<PreflightResult> {
  const script = buildPreflightScript(opts);
  const { stderr, code } = await runner(host, script);
  const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
  const warnings = lines
    .filter((l) => l.startsWith('MOLE_WARN:'))
    .map((l) => l.replace(/^MOLE_WARN:\s*/, ''));
  const errors = lines.filter((l) => !l.startsWith('MOLE_WARN:'));
  if (code !== 0) {
    return { ok: false, errors, warnings };
  }
  return { ok: true, errors: [], warnings };
}

export async function runPreflight(
  host: string,
  opts: PreflightOptions = {},
): Promise<PreflightResult> {
  return runPreflightWith(
    host,
    async (h, script) => {
      const proc = Bun.spawn(
        ['ssh', ...buildNonInteractiveSshArgs(h, ['bash', '-s'])],
        {
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      proc.stdin.write(script);
      proc.stdin.end();
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { stdout, stderr, code };
    },
    opts,
  );
}
