import { test, expect, describe } from 'bun:test';
import {
  initialWizardState,
  wizardReducer,
  type WizardState,
} from '../../../src/cli/wizard/reducer';
import type { SshHost } from '../../../src/lib/ssh-config';
import type { ProfileInfo } from '../../../src/lib/chrome-profile';

const HOST: SshHost = { name: 'vbm', user: 'root', hostname: 'martyvbm.syno' };
const PROFILE: ProfileInfo = { name: 'agent', path: '/p/agent', status: 'free' };

describe('initialWizardState', () => {
  test('starts on host step with no selections and submitted=false', () => {
    const s = initialWizardState();
    expect(s.step).toBe('host');
    expect(s.host).toBeNull();
    expect(s.profile).toBeNull();
    expect(s.submitted).toBe(false);
    expect(s.hostPicker).toEqual({ index: 0, input: '', cursor: 0 });
    expect(s.profilePicker).toEqual({ index: 0, input: '', cursor: 0 });
  });
});

describe('wizardReducer', () => {
  test('next from host advances to profile and stores host', () => {
    const s = wizardReducer(initialWizardState(), { type: 'next', payload: HOST });
    expect(s.step).toBe('profile');
    expect(s.host).toEqual(HOST);
  });

  test('next from profile (with profile) advances to review', () => {
    const s0 = wizardReducer(initialWizardState(), { type: 'next', payload: HOST });
    const s1 = wizardReducer(s0, { type: 'next', payload: PROFILE });
    expect(s1.step).toBe('review');
    expect(s1.profile).toEqual(PROFILE);
  });

  test("next from profile with 'skip' stores 'skip' and advances", () => {
    const s0 = wizardReducer(initialWizardState(), { type: 'next', payload: HOST });
    const s1 = wizardReducer(s0, { type: 'next', payload: 'skip' });
    expect(s1.step).toBe('review');
    expect(s1.profile).toBe('skip');
  });

  test('back from profile returns to host but keeps prior host selection', () => {
    const s0 = wizardReducer(initialWizardState(), { type: 'next', payload: HOST });
    const s1 = wizardReducer(s0, { type: 'back' });
    expect(s1.step).toBe('host');
    expect(s1.host).toEqual(HOST);
  });

  test('back from review returns to profile keeping both prior selections', () => {
    let s = wizardReducer(initialWizardState(), { type: 'next', payload: HOST });
    s = wizardReducer(s, { type: 'next', payload: PROFILE });
    s = wizardReducer(s, { type: 'back' });
    expect(s.step).toBe('profile');
    expect(s.host).toEqual(HOST);
    expect(s.profile).toEqual(PROFILE);
  });

  test('back from host is a no-op', () => {
    const s0 = initialWizardState();
    const s1 = wizardReducer(s0, { type: 'back' });
    expect(s1).toBe(s0);
  });

  test('submit only fires on review and flips submitted=true', () => {
    let s = wizardReducer(initialWizardState(), { type: 'next', payload: HOST });
    s = wizardReducer(s, { type: 'next', payload: PROFILE });
    s = wizardReducer(s, { type: 'submit' });
    expect(s.submitted).toBe(true);
    expect(s.step).toBe('review');
  });

  test('submit on non-review steps is a no-op', () => {
    const s0 = initialWizardState();
    const s1 = wizardReducer(s0, { type: 'submit' });
    expect(s1).toBe(s0);
  });

  test('updateHostPickerUi merges patch without changing step', () => {
    const s0 = initialWizardState();
    const s1 = wizardReducer(s0, {
      type: 'updateHostPickerUi',
      patch: { input: 'roo', cursor: 3 },
    });
    expect(s1.hostPicker).toEqual({ index: 0, input: 'roo', cursor: 3 });
    expect(s1.step).toBe('host');
  });

  test('updateProfilePickerUi merges patch', () => {
    const s0 = initialWizardState();
    const s1 = wizardReducer(s0, {
      type: 'updateProfilePickerUi',
      patch: { index: 2 },
    });
    expect(s1.profilePicker.index).toBe(2);
    expect(s1.profilePicker.input).toBe('');
  });
});
