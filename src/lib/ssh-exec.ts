import { buildNonInteractiveSshArgs } from './ssh-spawn';

export type SshRunner = (
  host: string,
  script: string,
) => Promise<{ stdout: string; stderr: string; code: number }>;

export const realSshRunner: SshRunner = async (host, script) => {
  const proc = Bun.spawn(
    ['ssh', ...buildNonInteractiveSshArgs(host, ['bash', '-s'])],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  proc.stdin.write(script);
  proc.stdin.end();
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};
