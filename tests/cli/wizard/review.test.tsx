import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { ReviewStep } from '../../../src/cli/wizard/review';
import type { SshHost } from '../../../src/lib/ssh-config';
import type { ProfileInfo } from '../../../src/lib/chrome-profile';

const HOST: SshHost = { name: 'vbm', user: 'root', hostname: 'martyvbm.syno' };
const PROFILE: ProfileInfo = {
  name: 'agent',
  path: '/p/agent',
  status: 'reusable',
  pid: 4242,
};

describe('<ReviewStep>', () => {
  test('renders host with two-line description', () => {
    const { lastFrame } = render(
      <ReviewStep host={HOST} profile={PROFILE} submitted={false} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Host');
    expect(frame).toContain('vbm');
    expect(frame).toContain('root@martyvbm.syno');
  });

  test('shows profile + status', () => {
    const { lastFrame } = render(
      <ReviewStep host={HOST} profile={PROFILE} submitted={false} />,
    );
    expect(lastFrame()).toContain('agent');
    expect(lastFrame()).toContain('reusable');
  });

  test('lists Chrome line in Will: when profile is set', () => {
    const { lastFrame } = render(
      <ReviewStep host={HOST} profile={PROFILE} submitted={false} />,
    );
    expect(lastFrame()).toContain('launch Chrome');
  });

  test('skip Chrome: profile shows skipped marker, no Chrome line', () => {
    const { lastFrame } = render(
      <ReviewStep host={HOST} profile="skip" submitted={false} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('skipped');
    expect(frame).not.toContain('launch Chrome');
  });

  test('submitted=true does not break rendering (fields still present)', () => {
    const { lastFrame } = render(
      <ReviewStep host={HOST} profile={PROFILE} submitted />,
    );
    expect(lastFrame()).toContain('vbm');
  });
});
