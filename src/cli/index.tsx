#!/usr/bin/env bun
import React, { useState, useEffect, useRef } from 'react';
import { render } from 'ink';
import { rm, unlink, stat } from 'fs/promises';
import { Wizard, type WizardState, type WizardSubmitPayload } from './wizard';
import { PreflightView, type PreflightStep } from './preflight';
import { spawnSsh } from '../lib/ssh-session';
import { fetchOurId } from '../lib/daemon-id';
import { startHijackWatchdog } from './hijack-watchdog';
import {
  initialPreflightSteps,
  runPreflightSteps,
  type PreflightRunResult,
} from './preflight-runner';
import pkg from '../../package.json' with { type: 'json' };
import { parseArgs } from './parse-args';
import { UninstallApp } from './commands/uninstall';
import { type UninstallDeps } from '../lib/uninstall';
import { PATHS, pathsToRemove } from '../lib/install-paths';

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
        await new Promise((r) => setTimeout(r, pre.ok ? 200 : 300));
        onDone(submission, pre);
      })
      .catch((err) => {
        setStep('daemon', {
          state: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
        setTimeout(() => onDone(submission, { ok: false }), 300);
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

async function realBootout(): Promise<{ code: number; stderr: string }> {
  const proc = Bun.spawn(
    ['launchctl', 'bootout', `gui/${process.getuid?.() ?? 0}/${PATHS.daemonLabel}`],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [stderr, code] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stderr };
}

async function socketGone(): Promise<boolean> {
  try {
    await stat(PATHS.socket);
    return false;
  } catch {
    return true;
  }
}

async function killDaemon(): Promise<void> {
  Bun.spawnSync(['pkill', '-9', '-f', 'mole-daemon'], {
    stdout: 'ignore',
    stderr: 'ignore',
  });
}

async function realRemove(
  path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    let s;
    try {
      s = await stat(path);
    } catch {
      return { ok: true };
    }
    if (s.isDirectory()) {
      await rm(path, { recursive: true, force: true });
    } else {
      await unlink(path);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const realDeps: UninstallDeps = {
  bootout: realBootout,
  socketGone,
  killDaemon,
  remove: realRemove,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

async function runUninstall(yes: boolean): Promise<number> {
  return new Promise<number>((resolve) => {
    const app = render(
      <UninstallApp
        deps={realDeps}
        paths={pathsToRemove()}
        yes={yes}
        onExit={(code) => {
          app.unmount();
          resolve(code);
        }}
      />,
    );
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.kind === 'version') {
    console.log(pkg.version);
    return;
  }

  if (args.kind === 'uninstall') {
    const code = await runUninstall(args.yes);
    process.exit(code);
  }

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

  // ink left stdin in raw mode; reset before ssh inherits fd 0.
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdin.unref();
  Bun.spawnSync(['stty', 'sane'], { stdio: ['inherit', 'inherit', 'inherit'] });

  const host = result.submission.host;
  const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
  const ourId = await fetchOurId(socketPath);

  const ssh = spawnSsh({ host: host.name });
  // pause/unref leaves Bun's read pump on fd 0; it races ssh on every
  // keystroke. ssh keeps its own dup via stdio:'inherit'.
  process.stdin.destroy();
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

  // Summarise the disconnect. Hijack already printed its own line; a
  // clean user-initiated `exit` (code 0) needs no extra chrome.
  if (!hijacked && code !== 0) {
    process.stderr.write(
      `\r\n\x1b[33m[mole] disconnected from ${host.name}` +
        (signal ? ` (signal ${signal})` : code !== null ? ` (code ${code})` : '') +
        `.\x1b[0m\r\n`,
    );
  }
}

// Explicit exit so the hijack watchdog's pending setTimeout doesn't
// keep the event loop alive after ssh disconnect.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
