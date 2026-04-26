import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { Wizard, type WizardSubmitPayload } from '../../../src/cli/wizard';
import type { SshHost } from '../../../src/lib/ssh-config';
import type { ProfileInfo } from '../../../src/lib/chrome-profile';

const HOSTS: SshHost[] = [
  { name: 'vbm', user: 'root', hostname: 'martyvbm.syno' },
  { name: 'prod', user: 'alice', hostname: 'p.example.com' },
];

const PROFILE = (
  name: string,
  status: ProfileInfo['status'] = 'free',
): ProfileInfo => ({ name, path: `/p/${name}`, status });

const KEY = {
  enter: '\r',
  down: '\x1b[B',
  up: '\x1b[A',
  esc: '\x1b',
  left: '\x1b[D',
};

const flush = () => new Promise((r) => setTimeout(r, 30));
const press = async (
  stdin: { write: (s: string) => void },
  data: string,
): Promise<void> => {
  await flush();
  stdin.write(data);
  await flush();
};

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
    // Step 1: host picker, default index 0 (vbm). Enter to advance.
    await press(stdin, KEY.enter);
    // Step 2: profile picker, default initial focus on first non-busy.
    await press(stdin, KEY.enter);
    // Step 3: review. Enter submits.
    await press(stdin, KEY.enter);
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
    // Advance to profile.
    await press(stdin, KEY.enter);
    expect(lastFrame()).toMatch(/Chrome profile/);
    // Escape back to host.
    await press(stdin, KEY.esc);
    expect(lastFrame()).toMatch(/SSH host/);
    // Escape on host: no-op.
    await press(stdin, KEY.esc);
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
    // Step 1: pick host vbm.
    await press(stdin, KEY.enter);
    // Step 2: profile picker. Initial focus on profile 'work' (index 0).
    // Need to navigate to skip row. Rows: [work, manualInput, skip].
    // skipRowIndex = profiles.length + 1 = 2.
    await press(stdin, KEY.down); // → manualInput (index 1)
    await press(stdin, KEY.down); // → skip (index 2)
    await press(stdin, KEY.enter);
    // Step 3: review. Enter submits.
    await press(stdin, KEY.enter);
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
    await press(stdin, KEY.enter); // host picked
    await press(stdin, KEY.enter); // profile picked
    await press(stdin, KEY.enter); // review submitted
    await press(stdin, KEY.enter); // should be ignored: state.submitted is true
    expect(submissions.length).toBe(1);
    unmount();
  });
});
