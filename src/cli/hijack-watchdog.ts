import { buildNonInteractiveSshArgs } from '../lib/ssh-spawn';
import { checkOnce, type CheckResult } from './watchdog';

export interface HijackWatchdogOptions {
  host: string;
  ourId: string | null;
  onHijack: () => void;
  isStopped: () => boolean;
}

// Two consecutive mismatches → fire. 'ok' or 'unreachable' both reset
// — transient ssh blips shouldn't accumulate toward a false positive.
export function evaluateStrike(
  prev: number,
  result: CheckResult,
): { strikes: number; fire: boolean } {
  if (result === 'mismatch') {
    const strikes = prev + 1;
    return { strikes, fire: strikes >= 2 };
  }
  return { strikes: 0, fire: false };
}

// Periodically asks the remote end whose daemon it's currently
// tunneling to. Two consecutive mismatches → invoke onHijack so the
// caller can disconnect (sshd unlinks our forwarded socket without
// notice when another client takes over the -R tunnel).
export function startHijackWatchdog(opts: HijackWatchdogOptions): void {
  const intervalSec = Number(process.env.MOLE_WATCHDOG_SEC ?? 10);
  if (!opts.ourId || !Number.isFinite(intervalSec) || intervalSec <= 0) return;
  const intervalMs = intervalSec * 1000;
  const ourId = opts.ourId;

  const runner = async (host: string) => {
    const proc = Bun.spawn(
      [
        'ssh',
        ...buildNonInteractiveSshArgs(host, [
          'curl',
          '-sf',
          '--max-time',
          '3',
          '--unix-socket',
          '/tmp/mole-clip.sock',
          'http://x/id',
        ]),
      ],
      { stdout: 'pipe', stderr: 'ignore' },
    );
    const [stdout, code] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    return { stdout, code };
  };

  void (async () => {
    let strikes = 0;
    while (!opts.isStopped()) {
      await new Promise((r) => setTimeout(r, intervalMs));
      if (opts.isStopped()) return;
      const result = await checkOnce({ host: opts.host, ourId, runner });
      const next = evaluateStrike(strikes, result);
      strikes = next.strikes;
      if (next.fire) {
        opts.onHijack();
        return;
      }
    }
  })();
}
