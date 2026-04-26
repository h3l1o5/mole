import React, { useReducer, useCallback } from 'react';
import { Box, useInput } from 'ink';
import {
  initialWizardState,
  wizardReducer,
  type WizardState,
  type PickerUiState,
} from './reducer';
import { WizardFrame, useWizardInnerWidth } from './frame';
import { Breadcrumb } from './breadcrumb';
import { WizardFooter } from './footer';
import { ReviewStep } from './review';
import { HostPicker } from '../host-picker';
import { ProfilePicker } from '../profile-picker';
import { useProfiles, type ProfileScanner } from '../hooks/use-profiles';
import { loadSshHosts, type SshHost } from '../../lib/ssh-config';
import {
  createProfile,
  type ProfileInfo,
} from '../../lib/chrome-profile';

export interface WizardSubmitPayload {
  host: SshHost;
  profile: ProfileInfo | 'skip';
}

export interface WizardProps {
  hosts?: SshHost[];
  scanner?: ProfileScanner;
  creator?: (name: string) => ProfileInfo;
  scanIntervalMs?: number;
  onSubmit: (p: WizardSubmitPayload) => void;
  // Visible content rendered below the wizard frame after submit (eg
  // the preflight steps). Receives the submitted state in case it
  // needs the choices.
  belowFrame?: (state: WizardState) => React.ReactNode;
}

export const Wizard: React.FC<WizardProps> = ({
  hosts,
  scanner,
  creator = createProfile,
  scanIntervalMs = 1000,
  onSubmit,
  belowFrame,
}) => {
  const [state, dispatch] = useReducer(
    wizardReducer,
    undefined,
    initialWizardState,
  );
  const innerWidth = useWizardInnerWidth();
  const sshHosts = React.useMemo(() => hosts ?? loadSshHosts(), [hosts]);
  const profiles = useProfiles(scanner, scanIntervalMs);

  // Reaching the manual-entry input row in either picker means ←/→/etc
  // belong to the TextInput, not to step navigation. Both the picker's
  // and Wizard's useInput fire on the same event; the picker consumes
  // the key for cursor movement, and we MUST refrain from also dispatching
  // a back action.
  const inInputMode = (() => {
    if (state.step === 'host') {
      return state.hostPicker.index === sshHosts.length;
    }
    if (state.step === 'profile') {
      return state.profilePicker.index === profiles.length;
    }
    return false;
  })();

  useInput((input, key) => {
    if (state.submitted) return;
    if ((key.escape || key.leftArrow) && !inInputMode) {
      dispatch({ type: 'back' });
    }
    if (state.step === 'review' && key.return) {
      dispatch({ type: 'submit' });
      onSubmit({ host: state.host!, profile: state.profile! });
    }
  });

  const onHostUiChange = useCallback(
    (patch: Partial<PickerUiState>) =>
      dispatch({ type: 'updateHostPickerUi', patch }),
    [],
  );
  const onProfileUiChange = useCallback(
    (patch: Partial<PickerUiState>) =>
      dispatch({ type: 'updateProfilePickerUi', patch }),
    [],
  );

  const renderStep = () => {
    if (state.step === 'host') {
      return (
        <HostPicker
          hosts={sshHosts}
          ui={state.hostPicker}
          onUiChange={onHostUiChange}
          onPick={(host) => dispatch({ type: 'next', payload: host })}
        />
      );
    }
    if (state.step === 'profile') {
      return (
        <ProfilePicker
          profiles={profiles}
          ui={state.profilePicker}
          onUiChange={onProfileUiChange}
          onPick={(p) => dispatch({ type: 'next', payload: p })}
          creator={creator}
        />
      );
    }
    return (
      <ReviewStep
        host={state.host!}
        profile={state.profile!}
        submitted={state.submitted}
      />
    );
  };

  const profileNameForBreadcrumb: string | 'skip' | null =
    state.profile === 'skip'
      ? 'skip'
      : state.profile?.name ?? null;

  return (
    <Box flexDirection="column">
      <WizardFrame frozen={state.submitted}>
        <Breadcrumb
          step={state.step}
          hostName={state.host?.name ?? null}
          profileName={profileNameForBreadcrumb}
          innerWidth={innerWidth}
          frozen={state.submitted}
        />
        <Box marginTop={1}>{renderStep()}</Box>
        <Box marginTop={1}>
          <WizardFooter step={state.step} submitted={state.submitted} />
        </Box>
      </WizardFrame>
      {state.submitted && belowFrame ? (
        <Box marginTop={1} marginBottom={1}>{belowFrame(state)}</Box>
      ) : null}
    </Box>
  );
};

export type { WizardState };
