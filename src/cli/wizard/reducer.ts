import type { SshHost } from '../../lib/ssh-config';
import type { ProfileInfo } from '../../lib/chrome-profile';

export type WizardStep = 'host' | 'profile' | 'review';

export interface PickerUiState {
  index: number;
  input: string;
  cursor: number;
}

export interface WizardState {
  step: WizardStep;
  host: SshHost | null;
  // null = not picked yet; 'skip' = user picked Skip Chrome.
  profile: ProfileInfo | 'skip' | null;
  // false = wizard is interactive; true = wizard frozen, preflight running.
  submitted: boolean;
  hostPicker: PickerUiState;
  profilePicker: PickerUiState;
}

export type WizardAction =
  | { type: 'next'; payload: SshHost | ProfileInfo | 'skip' }
  | { type: 'back' }
  | { type: 'submit' }
  | { type: 'updateHostPickerUi'; patch: Partial<PickerUiState> }
  | { type: 'updateProfilePickerUi'; patch: Partial<PickerUiState> };

export function initialWizardState(): WizardState {
  return {
    step: 'host',
    host: null,
    profile: null,
    submitted: false,
    hostPicker: { index: 0, input: '', cursor: 0 },
    profilePicker: { index: 0, input: '', cursor: 0 },
  };
}

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case 'next': {
      if (state.step === 'host') {
        return { ...state, step: 'profile', host: action.payload as SshHost };
      }
      if (state.step === 'profile') {
        return {
          ...state,
          step: 'review',
          profile: action.payload as ProfileInfo | 'skip',
        };
      }
      return state;
    }
    case 'back': {
      if (state.step === 'profile') return { ...state, step: 'host' };
      if (state.step === 'review') return { ...state, step: 'profile' };
      return state; // host: no-op
    }
    case 'submit': {
      if (state.step !== 'review' || state.submitted) return state;
      return { ...state, submitted: true };
    }
    case 'updateHostPickerUi':
      return {
        ...state,
        hostPicker: { ...state.hostPicker, ...action.patch },
      };
    case 'updateProfilePickerUi':
      return {
        ...state,
        profilePicker: { ...state.profilePicker, ...action.patch },
      };
  }
}
