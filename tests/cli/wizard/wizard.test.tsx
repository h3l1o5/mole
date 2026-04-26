import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { Wizard, type WizardSubmitPayload } from '../../../src/cli/wizard';
import type { SshHost } from '../../../src/lib/ssh-config';
import type { ProfileInfo } from '../../../src/lib/chrome-profile';
import { KEY, press } from '../ink-keys';

const HOSTS: SshHost[] = [
  { name: 'vbm', user: 'root', hostname: 'martyvbm.syno' },
  { name: 'prod', user: 'alice', hostname: 'p.example.com' },
];

const PROFILE = (
  name: string,
  status: ProfileInfo['status'] = 'free',
): ProfileInfo => ({ name, path: `/p/${name}`, status });

describe('<Wizard> end-to-end keystroke flow', () => {
  test('host → profile → review → submit dispatches onSubmit with both choices', async () => {
    const submissions: WizardSubmitPayload[] = [];
    const profiles = [PROFILE('work'), PROFILE('home')];
    const { stdin, unmount } = render(
      <Wizard
        hosts={HOSTS}
        scanner={async () => profiles}
        scanIntervalMs={10_000}
        onSubmit={(p) => submissions.push(p)}
      />,
    );
    await press(stdin, KEY.enter); // host
    await press(stdin, KEY.enter); // profile
    await press(stdin, KEY.enter); // review submit
    expect(submissions).toEqual([
      { host: HOSTS[0]!, profile: profiles[0]! },
    ]);
    unmount();
  });

  test('escape on profile step backs out to host (escape on host is a no-op)', async () => {
    const calls: WizardSubmitPayload[] = [];
    const profiles = [PROFILE('work')];
    const { stdin, lastFrame, unmount } = render(
      <Wizard
        hosts={HOSTS}
        scanner={async () => profiles}
        scanIntervalMs={10_000}
        onSubmit={(p) => calls.push(p)}
      />,
    );
    await press(stdin, KEY.enter);
    expect(lastFrame()).toMatch(/Chrome profile/);
    await press(stdin, KEY.esc);
    expect(lastFrame()).toMatch(/SSH host/);
    await press(stdin, KEY.esc); // no-op on host
    expect(lastFrame()).toMatch(/SSH host/);
    expect(calls).toEqual([]);
    unmount();
  });

  test('selecting Skip Chrome on profile step submits with profile = "skip"', async () => {
    const submissions: WizardSubmitPayload[] = [];
    const profiles = [PROFILE('work')];
    const { stdin, unmount } = render(
      <Wizard
        hosts={HOSTS}
        scanner={async () => profiles}
        scanIntervalMs={10_000}
        onSubmit={(p) => submissions.push(p)}
      />,
    );
    await press(stdin, KEY.enter); // host
    // Rows on profile step: [work, manualInput, skip]. Walk to skip.
    await press(stdin, KEY.down);
    await press(stdin, KEY.down);
    await press(stdin, KEY.enter); // profile = skip
    await press(stdin, KEY.enter); // review submit
    expect(submissions).toEqual([{ host: HOSTS[0]!, profile: 'skip' }]);
    unmount();
  });

  test('Enter on review only submits once even if pressed twice (idempotent guard at consumer)', async () => {
    const submissions: WizardSubmitPayload[] = [];
    const profiles = [PROFILE('work')];
    const { stdin, unmount } = render(
      <Wizard
        hosts={HOSTS}
        scanner={async () => profiles}
        scanIntervalMs={10_000}
        onSubmit={(p) => submissions.push(p)}
      />,
    );
    await press(stdin, KEY.enter); // host
    await press(stdin, KEY.enter); // profile
    await press(stdin, KEY.enter); // submit
    await press(stdin, KEY.enter); // ignored: state.submitted blocks re-fire
    expect(submissions.length).toBe(1);
    unmount();
  });
});
