#!/usr/bin/env bun
import React, { useState, useEffect, useRef } from 'react';
import { render } from 'ink';
import { Wizard } from './wizard';
import type { WizardState, WizardSubmitPayload } from './wizard';
import { PreflightView, type PreflightStep } from './preflight';
import type { SshHost } from '../lib/ssh-config';
import type { ProfileInfo } from '../lib/chrome-profile';
import { launchChrome } from '../lib/chrome-launcher';
import { isDaemonHealthy } from '../lib/daemon-health';
import { runPreflight } from '../lib/remote-preflight';
import { runCleanup } from '../lib/remote-cleanup';
import { spawnSsh } from '../lib/ssh-session';
import { buildNonInteractiveSshArgs } from '../lib/ssh-spawn';
import { checkOnce } from './watchdog';

interface PreflightRunResult {
  socatPid?: number;
  ok: boolean;
}

async function runPreflightSteps(
  payload: WizardSubmitPayload,
  setStep: (id: string, patch: Partial<PreflightStep>) => void,
): Promise<PreflightRunResult> {
  const { host, profile } = payload;
  const skipChrome = profile === 'skip';

  // Daemon
  setStep('daemon', { state: 'running' });
  const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
  const healthy = await isDaemonHealthy(socketPath);
  if (!healthy) {
    setStep('daemon', {
      state: 'error',
      error:
        'Daemon not responding. Run: launchctl kickstart -k gui/$UID/com.h3l1o5.mole-daemon',
    });
    return { ok: false };
  }
  setStep('daemon', { state: 'ok' });

  // Remote preflight
  setStep('remote', { state: 'running' });
  const r = await runPreflight(host.name);
  const warning = r.warnings.length > 0 ? r.warnings.join(' ') : undefined;
  if (!r.ok) {
    setStep('remote', { state: 'error', error: r.errors.join('; '), warning });
    return { ok: false };
  }
  setStep('remote', { state: 'ok', warning });
  if (warning) await new Promise((x) => setTimeout(x, 1500));

  if (!skipChrome) {
    setStep('chrome', { state: 'running' });
    const p = profile as ProfileInfo;
    if (p.status === 'reusable') {
      setStep('chrome', { state: 'ok', label: `Chrome (reusing pid ${p.pid})` });
    } else {
      launchChrome({ profilePath: p.path });
      await new Promise((x) => setTimeout(x, 1500));
      setStep('chrome', { state: 'ok' });
    }
  }

  return { ok: true, socatPid: r.socatPid };
}

const initialPreflightSteps = (
  host: SshHost,
  profile: ProfileInfo | 'skip',
): PreflightStep[] => {
  const steps: PreflightStep[] = [
    { id: 'daemon', label: 'Mac daemon', state: 'pending' },
    { id: 'remote', label: `Remote preflight (${host.name})`, state: 'pending' },
  ];
  if (profile !== 'skip') {
    steps.push({
      id: 'chrome',
      label: `Chrome (profile: ${profile.name})`,
      state: 'pending',
    });
  }
  return steps;
};

interface AppProps {
  onDone: (
    payload: WizardSubmitPayload | null,
    pre: PreflightRunResult | null,
  ) => void;
}

const App: React.FC<AppProps> = ({ onDone }) => {
  const [submission, setSubmission] = useState<WizardSubmitPayload | null>(
    null,
  );
  const [steps, setSteps] = useState<PreflightStep[] | null>(null);
  // Idempotent guard: prevent double-Enter on review from triggering
  // preflight twice (which would re-launch Chrome / re-spawn socat).
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!submission) return;
    const initial = initialPreflightSteps(submission.host, submission.profile);
    setSteps(initial);
    const setStep = (id: string, patch: Partial<PreflightStep>) =>
      setSteps((cur) =>
        cur ? cur.map((s) => (s.id === id ? { ...s, ...patch } : s)) : cur,
      );
    runPreflightSteps(submission, setStep)
      .then(async (pre) => {
        // Small pause so the user sees the final state before exit.
        await new Promise((r) => setTimeout(r, pre.ok ? 200 : 600));
        onDone(submission, pre);
      })
      .catch((err) => {
        setStep('daemon', {
          state: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
        setTimeout(() => onDone(submission, { ok: false }), 600);
      });
  }, [submission, onDone]);

  return (
    <Wizard
      onSubmit={(p) => {
        if (submittedRef.current) return;
        submittedRef.current = true;
        setSubmission(p);
      }}
      belowFrame={(_state: WizardState) =>
        steps ? <PreflightView steps={steps} /> : null
      }
    />
  );
};

async function main() {
  const result = await new Promise<{
    submission: WizardSubmitPayload | null;
    pre: PreflightRunResult | null;
  }>((resolve) => {
    const app = render(
      <App
        onDone={(submission, pre) => {
          app.unmount();
          resolve({ submission, pre });
        }}
      />,
    );
  });

  if (!result.submission || !result.pre || !result.pre.ok) {
    process.exit(1);
  }

  // Hand the TTY off to ssh cleanly. ink leaves stdin in raw mode on
  // unmount; if the Bun parent keeps reading stdin it races with the
  // ssh child and input feels completely stuck. So: reset termios,
  // detach our stdin, then spawn ssh via node:child_process.
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdin.unref();
  Bun.spawnSync(['stty', 'sane'], { stdio: ['inherit', 'inherit', 'inherit'] });

  const host = result.submission.host;
  const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
  const ourId = await fetchOurId(socketPath);

  const ssh = spawnSsh({ host: host.name });
  let sshExited = false;
  let hijacked = false;
  const sshExit = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    ssh.on('exit', (code, signal) => {
      sshExited = true;
      resolve({ code, signal });
    });
  });

  // Watchdog: if another client takes over the -R tunnel, sshd unlinks
  // our forwarded socket without notice. Periodically ask the remote
  // end who it's currently tunneling to; two strikes → bail so the
  // user isn't silently talking to another client's daemon.
  startHijackWatchdog({
    host: host.name,
    ourId,
    onHijack: () => {
      // ssh child puts the TTY in raw mode, so plain '\n' doesn't carriage
      // return. Wrap with '\r\n' and colour the line so it stands apart
      // from ssh's own "Connection to ... closed." that follows.
      process.stderr.write(
        '\r\n\x1b[33m[mole] another client took over the -R tunnel; disconnecting.\x1b[0m\r\n',
      );
      hijacked = true;
      ssh.kill('SIGTERM');
    },
    isStopped: () => sshExited,
  });

  const { code, signal } = await sshExit;

  // Summarise the disconnect. Hijack already printed its own yellow line
  // on the way out; a clean user-initiated `exit` (code 0) doesn't need
  // any chrome. Anything else (network drop, forced kill, etc) gets an
  // explicit "[mole] disconnected" so the user knows mole is winding
  // down rather than hung.
  if (!hijacked && code !== 0) {
    process.stderr.write(
      `\r\n\x1b[33m[mole] disconnected from ${host.name}` +
        (signal ? ` (signal ${signal})` : code !== null ? ` (code ${code})` : '') +
        `.\x1b[0m\r\n`,
    );
  }

  if (result.pre.socatPid !== undefined) {
    const r = await runCleanup(host.name, result.pre.socatPid).catch((e) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    }));
    if (r.ok) {
      process.stderr.write('\x1b[2m[mole] remote socat cleaned up.\x1b[0m\r\n');
    } else {
      process.stderr.write(
        `\x1b[33m[mole] cleanup failed: ${r.error ?? 'unknown'}. ` +
          `socat pid ${result.pre.socatPid} may still be running on ${host.name}.\x1b[0m\r\n`,
      );
    }
  }
}

async function fetchOurId(socketPath: string): Promise<string | null> {
  try {
    const r = await fetch('http://x/id', { unix: socketPath });
    if (!r.ok) return null;
    const j = (await r.json()) as { id?: string };
    return typeof j.id === 'string' && j.id.length > 0 ? j.id : null;
  } catch {
    return null;
  }
}

function startHijackWatchdog(opts: {
  host: string;
  ourId: string | null;
  onHijack: () => void;
  isStopped: () => boolean;
}): void {
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
        // 'ok' or 'unreachable' both reset — transient ssh blips shouldn't
        // accumulate toward a false positive.
        strikes = 0;
      }
    }
  })();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
