#!/usr/bin/env bun
import { closeSync } from 'node:fs';
import React, { useState, useEffect, useRef } from 'react';
import { render } from 'ink';
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

  // ink left stdin in raw mode; reset before ssh inherits fd 0.
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdin.unref();
  Bun.spawnSync(['stty', 'sane'], { stdio: ['inherit', 'inherit', 'inherit'] });

  const host = result.submission.host;
  const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
  const ourId = await fetchOurId(socketPath);

  const ssh = spawnSsh({ host: host.name });
  // ssh inherits a dup of fd 0; the parent must let go fully or the
  // two race per keystroke. destroy() drops the JS Readable,
  // closeSync(0) drops Bun's OS-level read pump.
  process.stdin.destroy();
  try { closeSync(0); } catch {}
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
