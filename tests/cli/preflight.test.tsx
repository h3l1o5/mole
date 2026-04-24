import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { PreflightView } from '../../src/cli/preflight';

describe('PreflightView', () => {
  test('renders steps with pending/running/ok/error states', () => {
    const { lastFrame } = render(
      <PreflightView
        steps={[
          { id: 'chrome', label: 'Chrome', state: 'ok' },
          { id: 'daemon', label: 'Daemon', state: 'running' },
          { id: 'remote', label: 'Remote preflight', state: 'pending' },
        ]}
      />,
    );
    const out = lastFrame()!;
    expect(out).toMatch(/✓\s*Chrome/);
    expect(out).toMatch(/…\s*Daemon/);
    expect(out).toMatch(/·\s*Remote preflight/);
  });

  test('error state shows error message', () => {
    const { lastFrame } = render(
      <PreflightView
        steps={[
          {
            id: 'remote',
            label: 'Remote preflight',
            state: 'error',
            error: 'socat not installed',
          },
        ]}
      />,
    );
    const out = lastFrame()!;
    expect(out).toMatch(/✗\s*Remote preflight/);
    expect(out).toContain('socat not installed');
  });

  test('warning is shown alongside an ok step', () => {
    const { lastFrame } = render(
      <PreflightView
        steps={[
          {
            id: 'remote',
            label: 'Remote preflight',
            state: 'ok',
            warning: 'cannot verify sshd StreamLocalBindUnlink',
          },
        ]}
      />,
    );
    const out = lastFrame()!;
    expect(out).toMatch(/✓\s*Remote preflight/);
    expect(out).toContain('cannot verify sshd StreamLocalBindUnlink');
  });
});
