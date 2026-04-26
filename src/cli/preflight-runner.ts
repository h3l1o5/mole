import type { WizardSubmitPayload } from './wizard';
import type { PreflightStep } from './preflight';
import type { SshHost } from '../lib/ssh-config';
import type { ProfileInfo } from '../lib/chrome-profile';
import { launchChrome } from '../lib/chrome-launcher';
import { isDaemonHealthy } from '../lib/daemon-health';
import { runPreflight } from '../lib/remote-preflight';

export interface PreflightRunResult {
  ok: boolean;
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

export async function runPreflightSteps(
  payload: WizardSubmitPayload,
  setStep: (id: string, patch: Partial<PreflightStep>) => void,
): Promise<PreflightRunResult> {
  const { host, profile } = payload;
  const skipChrome = profile === 'skip';

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

  return { ok: true };
}
