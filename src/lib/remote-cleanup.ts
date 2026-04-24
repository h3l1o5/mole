export function buildCleanupScript(socatPid: number): string {
  return `
pid=${socatPid}
if ps -p "$pid" -o args= 2>/dev/null | grep -q 'socat.*mole-chrome'; then
  kill "$pid" 2>/dev/null || true
fi
`.trim();
}

export type SshRunner = (
  host: string,
  script: string,
) => Promise<{ stdout: string; stderr: string; code: number }>;

export async function runCleanupWith(
  host: string,
  socatPid: number,
  runner: SshRunner,
): Promise<{ ok: boolean; error?: string }> {
  const { stderr, code } = await runner(host, buildCleanupScript(socatPid));
  if (code === 0) return { ok: true };
  return { ok: false, error: stderr.trim() };
}

export async function runCleanup(
  host: string,
  socatPid: number,
): Promise<{ ok: boolean; error?: string }> {
  return runCleanupWith(host, socatPid, async (h, script) => {
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
  });
}
