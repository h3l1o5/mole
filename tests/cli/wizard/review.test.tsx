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
  test('renders host name and computed description', () => {
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

  test('submitted=true hides the hint and still shows fields', () => {
    const { lastFrame } = render(
      <ReviewStep host={HOST} profile={PROFILE} submitted />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('vbm');
    expect(frame).not.toContain('enter start');
  });

  test('hint phrase still renders intact when not submitted', () => {
    const { lastFrame } = render(
      <ReviewStep host={HOST} profile={PROFILE} submitted={false} />,
    );
    expect(lastFrame() ?? '').toContain('enter start · ← back');
  });

  test('narrow path uses short status keyword, no em-dash phrase', () => {
    const { lastFrame } = render(
      <ReviewStep
        host={HOST}
        profile={PROFILE}
        submitted={false}
        innerWidth={48}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('(reusable)');
    expect(frame).not.toContain('reusable — will attach');
    expect(frame).toContain('launch Chrome');
  });

  test('wide path keeps the full em-dash status phrase', () => {
    const { lastFrame } = render(
      <ReviewStep
        host={HOST}
        profile={PROFILE}
        submitted={false}
        innerWidth={70}
      />,
    );
    expect(lastFrame() ?? '').toContain('reusable — will attach');
  });

  test('narrow path skip Chrome shows skipped marker', () => {
    const { lastFrame } = render(
      <ReviewStep
        host={HOST}
        profile="skip"
        submitted={false}
        innerWidth={48}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('skipped');
    expect(frame).not.toContain('launch Chrome');
  });
});
