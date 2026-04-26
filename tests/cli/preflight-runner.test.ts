import { test, expect, describe } from 'bun:test';
import {
  initialPreflightSteps,
  runPreflightStepsWith,
  type PreflightDeps,
  type SetStep,
} from '../../src/cli/preflight-runner';
import type { PreflightStep, PreflightStepId } from '../../src/cli/preflight';
import type { SshHost } from '../../src/lib/ssh-config';
import type { ProfileInfo } from '../../src/lib/chrome-profile';

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
}

const harness = (
  over: Partial<PreflightDeps> = {},
): { setStep: SetStep; trace: Trace; deps: PreflightDeps } => {
  const trace: Trace = {
    steps: new Map(),
    order: [],
    chromeLaunched: false,
    sleeps: [],
  };
  const setStep: SetStep = (id, patch) => {
    trace.order.push({ id, patch });
    const prev = trace.steps.get(id) ?? {};
    trace.steps.set(id, { ...prev, ...patch });
  };
  const deps: PreflightDeps = {
    isDaemonHealthy: async () => true,
    runPreflight: async () => ({ ok: true, errors: [], warnings: [] }),
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
      'daemon', // running
      'daemon', // ok
      'remote', // running
      'remote', // ok
      'chrome', // running
      'chrome', // ok
    ]);
    expect(trace.chromeLaunched).toBe(true);
    expect(trace.sleeps).toEqual([1500]); // post-Chrome-launch wait only
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
    expect(trace.chromeLaunched).toBe(false);
    expect(trace.sleeps).toEqual([]);
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
    expect(trace.sleeps).toEqual([]); // no post-launch sleep when reusing
    expect(trace.steps.get('chrome')!.label).toBe('Chrome (reusing pid 4242)');
  });
});

describe('runPreflightStepsWith — failure short-circuit', () => {
  test('daemon down → no remote, no chrome, error message visible', async () => {
    const { setStep, trace, deps } = harness({
      isDaemonHealthy: async () => false,
    });
    const result = await runPreflightStepsWith(
      { host: HOST, profile: PROFILE() },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.order.some((o) => o.id === 'remote')).toBe(false);
    expect(trace.order.some((o) => o.id === 'chrome')).toBe(false);
    expect(trace.steps.get('daemon')!.state).toBe('error');
    expect(trace.steps.get('daemon')!.error).toMatch(/launchctl kickstart/);
  });

  test('remote preflight fails → no chrome, errors joined with semicolons', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => ({
        ok: false,
        errors: ['ERROR: socat not installed', 'ERROR: shim missing'],
        warnings: [],
      }),
    });
    const result = await runPreflightStepsWith(
      { host: HOST, profile: PROFILE() },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.chromeLaunched).toBe(false);
    expect(trace.order.some((o) => o.id === 'chrome')).toBe(false);
    expect(trace.steps.get('remote')!.state).toBe('error');
    expect(trace.steps.get('remote')!.error).toBe(
      'ERROR: socat not installed; ERROR: shim missing',
    );
  });
});

describe('runPreflightStepsWith — warning surfacing', () => {
  test('remote preflight ok with warnings → step is ok and includes the warning string', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => ({
        ok: true,
        errors: [],
        warnings: ['cannot read sshd config'],
      }),
    });
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(trace.steps.get('remote')!.state).toBe('ok');
    expect(trace.steps.get('remote')!.warning).toMatch(/cannot read sshd config/);
    expect(trace.sleeps).toContain(1500);
  });

  test('remote preflight fails with both warnings and errors → both surface', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => ({
        ok: false,
        errors: ['ERROR: missing StreamLocalBindUnlink'],
        warnings: ['partial config readable'],
      }),
    });
    await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(trace.steps.get('remote')!.warning).toBe('partial config readable');
    expect(trace.steps.get('remote')!.error).toMatch(/StreamLocalBindUnlink/);
  });
});
