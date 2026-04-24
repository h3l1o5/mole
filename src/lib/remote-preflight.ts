export interface PreflightOptions {
  chromeSocket?: string;
  chromePort?: number;
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  socatPid?: number;
}

export function buildPreflightScript(opts: PreflightOptions = {}): string {
  const sock = opts.chromeSocket ?? '/tmp/mole-chrome.sock';
  const port = opts.chromePort ?? 9222;
  return `
set -eu
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
pgrep -f 'socat.*mole-chrome' | head -1
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
  const { stdout, stderr, code } = await runner(host, script);
  if (code !== 0) {
    const errors = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
    return { ok: false, errors };
  }
  const pid = parseInt(stdout.trim(), 10);
  return {
    ok: true,
    errors: [],
    socatPid: Number.isFinite(pid) ? pid : undefined,
  };
}

export async function runPreflight(
  host: string,
  opts: PreflightOptions = {},
): Promise<PreflightResult> {
  return runPreflightWith(
    host,
    async (h, script) => {
      const proc = Bun.spawn(['ssh', h, 'bash', '-s'], {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      });
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
