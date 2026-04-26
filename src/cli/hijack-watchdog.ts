import { buildNonInteractiveSshArgs } from '../lib/ssh-spawn';
import { checkOnce } from './watchdog';

export interface HijackWatchdogOptions {
  host: string;
  ourId: string | null;
  onHijack: () => void;
  isStopped: () => boolean;
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
      if (result === 'mismatch') {
        strikes++;
        if (strikes >= 2) {
          opts.onHijack();
          return;
        }
      } else {
        // 'ok' or 'unreachable' both reset — transient ssh blips
        // shouldn't accumulate toward a false positive.
        strikes = 0;
      }
    }
  })();
}
