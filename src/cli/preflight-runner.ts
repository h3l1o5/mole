import type { WizardSubmitPayload } from './wizard';
import type {
  PreflightStep,
  PreflightStepId,
  PreflightPrompt,
} from './preflight';
import type { SshHost } from '../lib/ssh-config';
import type { ProfileInfo } from '../lib/chrome-profile';
import { launchChrome } from '../lib/chrome-launcher';
import { isDaemonHealthy } from '../lib/daemon-health';
import {
  runPreflight,
  type PreflightOutcome,
  type Distro,
} from '../lib/remote-preflight';
import { installShim, type InstallOutcome } from '../lib/remote-shim-install';
import { SHIM_HASH } from '../lib/remote-shim';

export interface PreflightRunResult {
  ok: boolean;
}

export type SetStep = (id: PreflightStepId, patch: Partial<PreflightStep>) => void;

export interface PreflightDeps {
  isDaemonHealthy: () => Promise<boolean>;
  runPreflight: (host: string) => Promise<PreflightOutcome>;
  installShim: (host: string) => Promise<InstallOutcome>;
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

const SOCAT_HINT: Record<Distro, string> = {
  debian: 'socat not installed. Run on the remote machine: sudo apt install socat xclip',
  rhel: 'socat not installed. Run on the remote machine: sudo dnf install socat xclip',
  arch: 'socat not installed. Run on the remote machine: sudo pacman -S socat xclip',
  unknown:
    'socat not installed. Install on the remote machine via your package manager (e.g. apt / dnf / pacman) along with xclip.',
};

const SSHD_HINT =
  "remote sshd missing 'StreamLocalBindUnlink yes'. Fix: " +
  "echo 'StreamLocalBindUnlink yes' | sudo tee -a /etc/ssh/sshd_config && sudo systemctl reload ssh.service";

async function handleRemoteOutcome(
  host: string,
  setStep: SetStep,
  deps: PreflightDeps,
  outcome: PreflightOutcome,
  remainingInstallAttempts: number,
): Promise<{ ok: boolean }> {
  switch (outcome.kind) {
    case 'ok': {
      const warning = outcome.warnings.length > 0 ? outcome.warnings.join(' ') : undefined;
      setStep('remote', { state: 'ok', warning });
      if (warning) await deps.sleep(1500);
      return { ok: true };
    }
    case 'socat-missing': {
      setStep('remote', { state: 'error', error: SOCAT_HINT[outcome.distro] });
      return { ok: false };
    }
    case 'sshd-config-missing': {
      setStep('remote', { state: 'error', error: SSHD_HINT });
      return { ok: false };
    }
    case 'error': {
      setStep('remote', { state: 'error', error: outcome.errors.join('; ') });
      return { ok: false };
    }
    case 'shim-missing':
    case 'shim-outdated': {
      if (remainingInstallAttempts <= 0) {
        setStep('remote', {
          state: 'error',
          error: `Reinstall did not stick. Check $HOME/.local/bin/xclip on ${host}.`,
        });
        return { ok: false };
      }
      const yes = await new Promise<boolean>((resolve) => {
        const prompt: PreflightPrompt =
          outcome.kind === 'shim-missing'
            ? { kind: 'install-shim', host, onAnswer: resolve }
            : {
                kind: 'update-shim',
                host,
                remoteHash: outcome.remoteHash,
                expectedHash: SHIM_HASH,
                onAnswer: resolve,
              };
        setStep('remote', { state: 'prompt', prompt });
      });
      if (!yes) {
        setStep('remote', {
          state: 'error',
          error: 'shim install declined.',
        });
        return { ok: false };
      }
      setStep('remote', {
        state: 'installing',
        installingMessage: `Installing mole shim on ${host}…`,
      });
      const installOutcome = await deps.installShim(host);
      if (!installOutcome.ok) {
        setStep('remote', {
          state: 'error',
          error: `shim install failed: ${installOutcome.error}`,
        });
        return { ok: false };
      }
      setStep('remote', { state: 'running' });
      const next = await deps.runPreflight(host);
      return handleRemoteOutcome(host, setStep, deps, next, remainingInstallAttempts - 1);
    }
  }
}

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
  const outcome = await deps.runPreflight(host.name);
  const remoteResult = await handleRemoteOutcome(
    host.name,
    setStep,
    deps,
    outcome,
    1,
  );
  if (!remoteResult.ok) return { ok: false };

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
    runPreflight: (host) => runPreflight(host, { expectedShimHash: SHIM_HASH }),
    installShim: (host) => installShim(host),
    launchChrome,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
}
