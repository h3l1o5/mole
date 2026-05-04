import { test, expect, describe } from 'bun:test';
import {
  initialPreflightSteps,
  runPreflightStepsWith,
  type PreflightDeps,
  type SetStep,
} from '../../src/cli/preflight-runner';
import type {
  PreflightStep,
  PreflightStepId,
  PreflightPrompt,
} from '../../src/cli/preflight';
import type { SshHost } from '../../src/lib/ssh-config';
import type { ProfileInfo } from '../../src/lib/chrome-profile';
import type { PreflightOutcome } from '../../src/lib/remote-preflight';
import type { InstallOutcome } from '../../src/lib/remote-shim-install';

const HOST: SshHost = { name: 'vbm' };
const PROFILE = (
  status: ProfileInfo['status'] = 'free',
  pid?: number,
): ProfileInfo => ({ name: 'work', path: '/p/work', status, pid });

interface Trace {
  steps: Map<PreflightStepId, Partial<PreflightStep>>;
  order: Array<{ id: PreflightStepId; patch: Partial<PreflightStep> }>;
  chromeLaunched: boolean;
  sleeps: number[];
  preflightCalls: number;
  installCalls: number;
}

const harness = (
  over: Partial<PreflightDeps> = {},
): { setStep: SetStep; trace: Trace; deps: PreflightDeps } => {
  const trace: Trace = {
    steps: new Map(),
    order: [],
    chromeLaunched: false,
    sleeps: [],
    preflightCalls: 0,
    installCalls: 0,
  };
  const setStep: SetStep = (id, patch) => {
    trace.order.push({ id, patch });
    const prev = trace.steps.get(id) ?? {};
    trace.steps.set(id, { ...prev, ...patch });
  };
  const deps: PreflightDeps = {
    isDaemonHealthy: async () => true,
    runPreflight: async (): Promise<PreflightOutcome> => {
      trace.preflightCalls += 1;
      return { kind: 'ok', warnings: [] };
    },
    installShim: async (): Promise<InstallOutcome> => {
      trace.installCalls += 1;
      return { ok: true };
    },
    launchChrome: () => {
      trace.chromeLaunched = true;
    },
    sleep: async (ms) => {
      trace.sleeps.push(ms);
    },
    ...over,
  };
  return { setStep, trace, deps };
};

describe('initialPreflightSteps', () => {
  test('includes chrome step when profile is a real profile', () => {
    const steps = initialPreflightSteps(HOST, PROFILE());
    expect(steps.map((s) => s.id)).toEqual(['daemon', 'remote', 'chrome']);
    expect(steps.find((s) => s.id === 'chrome')!.label).toMatch(/work/);
  });

  test('omits chrome step when profile is "skip"', () => {
    const steps = initialPreflightSteps(HOST, 'skip');
    expect(steps.map((s) => s.id)).toEqual(['daemon', 'remote']);
  });

  test('every step starts in pending', () => {
    const steps = initialPreflightSteps(HOST, PROFILE());
    expect(steps.every((s) => s.state === 'pending')).toBe(true);
  });

  test('remote step label includes the host name', () => {
    const steps = initialPreflightSteps({ name: 'prod' }, 'skip');
    expect(steps.find((s) => s.id === 'remote')!.label).toMatch(/prod/);
  });
});

describe('runPreflightStepsWith — happy path', () => {
  test('runs daemon → remote → chrome in order, returns ok=true, launches Chrome', async () => {
    const { setStep, trace, deps } = harness();
    const result = await runPreflightStepsWith(
      { host: HOST, profile: PROFILE() },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(trace.order.map((o) => o.id)).toEqual([
      'daemon',
      'daemon',
      'remote',
      'remote',
      'chrome',
      'chrome',
    ]);
    expect(trace.chromeLaunched).toBe(true);
  });

  test('skips chrome step entirely when profile is "skip"', async () => {
    const { setStep, trace, deps } = harness();
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(trace.order.some((o) => o.id === 'chrome')).toBe(false);
  });

  test('reusable profile reports "reusing pid N" without launching Chrome', async () => {
    const { setStep, trace, deps } = harness();
    const result = await runPreflightStepsWith(
      { host: HOST, profile: PROFILE('reusable', 4242) },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(trace.chromeLaunched).toBe(false);
    expect(trace.steps.get('chrome')!.label).toBe('Chrome (reusing pid 4242)');
  });
});

describe('runPreflightStepsWith — failure short-circuit', () => {
  test('daemon down → no remote, no chrome', async () => {
    const { setStep, trace, deps } = harness({
      isDaemonHealthy: async () => false,
    });
    const result = await runPreflightStepsWith(
      { host: HOST, profile: PROFILE() },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.steps.get('daemon')!.state).toBe('error');
    expect(trace.steps.get('daemon')!.error).toMatch(/launchctl kickstart/);
  });

  test('socat-missing debian → error step with apt one-liner, no install attempt', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'socat-missing', distro: 'debian' };
      },
    });
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.steps.get('remote')!.state).toBe('error');
    expect(trace.steps.get('remote')!.error).toMatch(/sudo apt install/);
    expect(trace.installCalls).toBe(0);
  });

  test('socat-missing arch → pacman one-liner', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'socat-missing', distro: 'arch' };
      },
    });
    await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(trace.steps.get('remote')!.error).toMatch(/sudo pacman/);
  });

  test('socat-missing unknown → generic guidance', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'socat-missing', distro: 'unknown' };
      },
    });
    await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(trace.steps.get('remote')!.error).toMatch(/socat/);
    expect(trace.steps.get('remote')!.error).toMatch(/package manager/i);
  });

  test('sshd-config-missing → existing guidance', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'sshd-config-missing' };
      },
    });
    await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(trace.steps.get('remote')!.error).toMatch(/StreamLocalBindUnlink/);
  });

  test('auth-failed → ssh-copy-id hint, no install attempt', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'auth-failed' };
      },
    });
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.steps.get('remote')!.state).toBe('error');
    const err = trace.steps.get('remote')!.error!;
    expect(err).toMatch(/ssh authentication failed/i);
    expect(err).toMatch(/non-interactive/);
    expect(err).toMatch(/ssh-add/);
    expect(err).toMatch(/ssh-copy-id/);
    expect(err).toContain('vbm');
    expect(trace.installCalls).toBe(0);
  });

  test('error kind → joined stderr', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'error', errors: ['boom', 'kapow'] };
      },
    });
    await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(trace.steps.get('remote')!.error).toBe('boom; kapow');
  });
});

describe('runPreflightStepsWith — shim install flow', () => {
  test('shim-missing → prompt → user answers Y → installShim → re-preflight → ok', async () => {
    let preflightCallCount = 0;

    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        preflightCallCount += 1;
        trace.preflightCalls += 1;
        if (preflightCallCount === 1) return { kind: 'shim-missing' };
        return { kind: 'ok', warnings: [] };
      },
      installShim: async () => {
        trace.installCalls += 1;
        return { ok: true };
      },
    });

    const wrappedSetStep: SetStep = (id, patch) => {
      setStep(id, patch);
      if (patch.state === 'prompt' && patch.prompt) {
        const onAnswer = patch.prompt.onAnswer;
        queueMicrotask(() => onAnswer(true));
      }
    };

    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      wrappedSetStep,
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(trace.preflightCalls).toBe(2);
    expect(trace.installCalls).toBe(1);
    expect(trace.steps.get('remote')!.state).toBe('ok');
  });

  test('shim-missing → user answers n → ok=false, no install', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'shim-missing' };
      },
    });
    const wrappedSetStep: SetStep = (id, patch) => {
      setStep(id, patch);
      if (patch.state === 'prompt' && patch.prompt) {
        const onAnswer = patch.prompt.onAnswer;
        queueMicrotask(() => onAnswer(false));
      }
    };
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      wrappedSetStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.installCalls).toBe(0);
  });

  test('shim-outdated → prompt with update kind → install → ok', async () => {
    let preflightCallCount = 0;
    let capturedPrompt: PreflightPrompt | undefined;
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        preflightCallCount += 1;
        trace.preflightCalls += 1;
        if (preflightCallCount === 1)
          return { kind: 'shim-outdated', remoteHash: 'aaa111bbb222' };
        return { kind: 'ok', warnings: [] };
      },
    });
    const wrappedSetStep: SetStep = (id, patch) => {
      setStep(id, patch);
      if (patch.state === 'prompt' && patch.prompt) {
        capturedPrompt = patch.prompt;
        const onAnswer = patch.prompt.onAnswer;
        queueMicrotask(() => onAnswer(true));
      }
    };
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      wrappedSetStep,
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(capturedPrompt!.kind).toBe('update-shim');
    expect(capturedPrompt!.remoteHash).toBe('aaa111bbb222');
  });

  test('install fails → error state, no further preflight', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'shim-missing' };
      },
      installShim: async () => {
        trace.installCalls += 1;
        return { ok: false, error: 'permission denied' };
      },
    });
    const wrappedSetStep: SetStep = (id, patch) => {
      setStep(id, patch);
      if (patch.state === 'prompt' && patch.prompt) {
        const onAnswer = patch.prompt.onAnswer;
        queueMicrotask(() => onAnswer(true));
      }
    };
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      wrappedSetStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.preflightCalls).toBe(1);
    expect(trace.installCalls).toBe(1);
    expect(trace.steps.get('remote')!.state).toBe('error');
    expect(trace.steps.get('remote')!.error).toMatch(/permission denied/);
  });

  test('re-preflight after install still shim-missing → error (max retries reached)', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'shim-missing' };
      },
    });
    let promptCount = 0;
    const wrappedSetStep: SetStep = (id, patch) => {
      setStep(id, patch);
      if (patch.state === 'prompt' && patch.prompt) {
        promptCount += 1;
        const onAnswer = patch.prompt.onAnswer;
        queueMicrotask(() => onAnswer(true));
      }
    };
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      wrappedSetStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.preflightCalls).toBe(2);
    expect(trace.installCalls).toBe(1);
    expect(promptCount).toBe(1);
    expect(trace.steps.get('remote')!.error).toMatch(/Reinstall did not stick/);
  });
});

describe('runPreflightStepsWith — warning surfacing', () => {
  test('ok with warnings → step ok, warning visible', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'ok', warnings: ['cannot read sshd config'] };
      },
    });
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(trace.steps.get('remote')!.state).toBe('ok');
    expect(trace.steps.get('remote')!.warning).toMatch(/cannot read sshd config/);
  });
});
