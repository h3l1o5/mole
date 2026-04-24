#!/usr/bin/env bun
import React, { useState } from 'react';
import { render } from 'ink';
import { HostPicker } from './host-picker';
import { ProfilePicker } from './profile-picker';
import { PreflightView, type PreflightStep } from './preflight';
import { loadSshHosts, type SshHost } from '../lib/ssh-config';
import type { ProfileInfo } from '../lib/chrome-profile';
import { launchChrome } from '../lib/chrome-launcher';
import { isDaemonHealthy } from '../lib/daemon-health';
import { runPreflight } from '../lib/remote-preflight';
import { runCleanup } from '../lib/remote-cleanup';
import { spawnSsh } from '../lib/ssh-session';
import { buildNonInteractiveSshArgs } from '../lib/ssh-spawn';
import { checkOnce } from './watchdog';

async function pickHost(): Promise<SshHost | null> {
  const hosts = loadSshHosts();
  return new Promise((resolve) => {
    let picked = false;
    const app = render(
      <HostPicker
        hosts={hosts}
        onSelect={(h) => {
          picked = true;
          app.unmount();
          resolve(h);
        }}
      />,
    );
    app.waitUntilExit().then(() => {
      if (!picked) resolve(null);
    });
  });
}

async function pickProfile(): Promise<ProfileInfo | null> {
  return new Promise((resolve) => {
    let picked = false;
    const app = render(
      <ProfilePicker
        onSelect={(p) => {
          picked = true;
          app.unmount();
          resolve(p);
        }}
      />,
    );
    app.waitUntilExit().then(() => {
      if (!picked) resolve(null);
    });
  });
}

interface PreflightRunResult {
  socatPid?: number;
  ok: boolean;
}

async function runPreflightWithUi(
  host: SshHost,
  profile: ProfileInfo,
): Promise<PreflightRunResult> {
  let updateSteps: (fn: (s: PreflightStep[]) => PreflightStep[]) => void = () => {};
  let unmountApp: () => void = () => {};

  const Container: React.FC = () => {
    const [steps, setSteps] = useState<PreflightStep[]>([
      { id: 'daemon', label: 'Mac daemon', state: 'pending' },
      { id: 'remote', label: `Remote preflight (${host.name})`, state: 'pending' },
      { id: 'chrome', label: `Chrome (profile: ${profile.name})`, state: 'pending' },
    ]);
    updateSteps = setSteps;
    return <PreflightView steps={steps} />;
  };

  const app = render(<Container />);
  unmountApp = () => app.unmount();

  const setStep = (id: string, patch: Partial<PreflightStep>) => {
    updateSteps((steps) =>
      steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  // Order matters: reversible checks (daemon, remote) run before the
  // Chrome launch, which has a user-visible side effect. If any check
  // fails, we bail without spawning Chrome.

  // Step 1: Daemon
  setStep('daemon', { state: 'running' });
  const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
  const healthy = await isDaemonHealthy(socketPath);
  if (!healthy) {
    setStep('daemon', {
      state: 'error',
      error:
        'Daemon not responding. Run: launchctl kickstart -k gui/$UID/com.h3l1o5.mole-daemon',
    });
    await new Promise((r) => setTimeout(r, 300));
    unmountApp();
    return { ok: false };
  }
  setStep('daemon', { state: 'ok' });

  // Step 2: Remote preflight
  setStep('remote', { state: 'running' });
  const r = await runPreflight(host.name);
  if (!r.ok) {
    setStep('remote', { state: 'error', error: r.errors.join('; ') });
    await new Promise((x) => setTimeout(x, 300));
    unmountApp();
    return { ok: false };
  }
  setStep('remote', { state: 'ok' });

  // Step 3: Chrome (last — has user-visible side effects)
  setStep('chrome', { state: 'running' });
  if (profile.status === 'reusable') {
    setStep('chrome', { state: 'ok', label: `Chrome (reusing pid ${profile.pid})` });
  } else {
    launchChrome({ profilePath: profile.path });
    // give Chrome a moment to open the debug port
    await new Promise((x) => setTimeout(x, 1500));
    setStep('chrome', { state: 'ok' });
  }

  // small pause so user sees all green
  await new Promise((x) => setTimeout(x, 200));
  unmountApp();
  return { ok: true, socatPid: r.socatPid };
}

async function main() {
  const host = await pickHost();
  if (!host) process.exit(1);

  const profile = await pickProfile();
  if (!profile) process.exit(1);

  const pre = await runPreflightWithUi(host, profile);
  if (!pre.ok) process.exit(1);

  // Hand the TTY off to ssh cleanly. ink leaves stdin in raw mode on
  // unmount; if the Bun parent keeps reading stdin it races with the
  // ssh child and input feels completely stuck. So: reset termios,
  // detach our stdin, then spawn ssh via node:child_process.
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdin.unref();
  Bun.spawnSync(['stty', 'sane'], { stdio: ['inherit', 'inherit', 'inherit'] });

  const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
  const ourId = await fetchOurId(socketPath);

  const ssh = spawnSsh({ host: host.name });
  let sshExited = false;
  const sshExit = new Promise<void>((resolve) => {
    ssh.on('exit', () => {
      sshExited = true;
      resolve();
    });
  });

  // Watchdog: if another Mac takes over the -R tunnel, sshd unlinks our
  // forwarded socket without notice. Periodically ask the remote end
  // who it's currently tunneling to; two strikes → bail so the user
  // isn't silently talking to another Mac's daemon.
  startHijackWatchdog({
    host: host.name,
    ourId,
    onHijack: () => {
      // ssh child puts the TTY in raw mode, so plain '\n' doesn't carriage
      // return. Wrap with '\r\n' and colour the line so it stands apart
      // from ssh's own "Connection to ... closed." that follows.
      process.stderr.write(
        '\r\n\x1b[33m[mole] another mac took over the -R tunnel; disconnecting.\x1b[0m\r\n',
      );
      ssh.kill('SIGTERM');
    },
    isStopped: () => sshExited,
  });

  await sshExit;

  // cleanup (silent)
  if (pre.socatPid !== undefined) {
    await runCleanup(host.name, pre.socatPid).catch(() => {});
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
