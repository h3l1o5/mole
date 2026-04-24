export type CheckResult = 'ok' | 'mismatch' | 'unreachable';

export type CheckRunner = (
  host: string,
) => Promise<{ stdout: string; code: number }>;

export interface CheckOptions {
  host: string;
  ourId: string;
  runner: CheckRunner;
}

export async function checkOnce(opts: CheckOptions): Promise<CheckResult> {
  let out: { stdout: string; code: number };
  try {
    out = await opts.runner(opts.host);
  } catch {
    return 'unreachable';
  }
  if (out.code !== 0) return 'unreachable';
  let parsed: unknown;
  try {
    parsed = JSON.parse(out.stdout);
  } catch {
    return 'unreachable';
  }
  const remoteId =
    parsed && typeof parsed === 'object' && 'id' in parsed
      ? String((parsed as { id: unknown }).id)
      : '';
  return remoteId === opts.ourId ? 'ok' : 'mismatch';
}
