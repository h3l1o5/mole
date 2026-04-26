import type { WizardSubmitPayload } from './wizard';
import type { PreflightStep } from './preflight';
import type { SshHost } from '../lib/ssh-config';
import type { ProfileInfo } from '../lib/chrome-profile';
import { launchChrome } from '../lib/chrome-launcher';
import { isDaemonHealthy } from '../lib/daemon-health';
import { runPreflight } from '../lib/remote-preflight';
import type { PreflightResult } from '../lib/remote-preflight';

export interface PreflightRunResult {
  ok: boolean;
}

export type SetStep = (id: string, patch: Partial<PreflightStep>) => void;

export interface PreflightDeps {
  isDaemonHealthy: () => Promise<boolean>;
  runPreflight: (host: string) => Promise<PreflightResult>;
  launchChrome: (opts: { profilePath: string }) => void;
  sleep: (ms: number) => Promise<void>;
}

export const initialPreflightSteps = (
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

export async function runPreflightStepsWith(
  payload: WizardSubmitPayload,
  setStep: SetStep,
  deps: PreflightDeps,
): Promise<PreflightRunResult> {
  const { host, profile } = payload;
  const skipChrome = profile === 'skip';

  setStep('daemon', { state: 'running' });
  const healthy = await deps.isDaemonHealthy();
  if (!healthy) {
    setStep('daemon', {
      state: 'error',
      error:
        'Daemon not responding. Run: launchctl kickstart -k gui/$UID/com.h3l1o5.mole-daemon',
    });
    return { ok: false };
  }
  setStep('daemon', { state: 'ok' });

  setStep('remote', { state: 'running' });
  const r = await deps.runPreflight(host.name);
  const warning = r.warnings.length > 0 ? r.warnings.join(' ') : undefined;
  if (!r.ok) {
    setStep('remote', { state: 'error', error: r.errors.join('; '), warning });
    return { ok: false };
  }
  setStep('remote', { state: 'ok', warning });
  if (warning) await deps.sleep(1500);

  if (!skipChrome) {
    setStep('chrome', { state: 'running' });
    const p = profile as ProfileInfo;
    if (p.status === 'reusable') {
      setStep('chrome', { state: 'ok', label: `Chrome (reusing pid ${p.pid})` });
    } else {
      deps.launchChrome({ profilePath: p.path });
      await deps.sleep(1500);
      setStep('chrome', { state: 'ok' });
    }
  }

  return { ok: true };
}

export async function runPreflightSteps(
  payload: WizardSubmitPayload,
  setStep: SetStep,
): Promise<PreflightRunResult> {
  const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
  return runPreflightStepsWith(payload, setStep, {
    isDaemonHealthy: () => isDaemonHealthy(socketPath),
    runPreflight: (host) => runPreflight(host),
    launchChrome,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
}
