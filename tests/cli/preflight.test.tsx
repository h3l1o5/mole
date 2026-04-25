import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { PreflightView } from '../../src/cli/preflight';
import { icons, spinnerFrames } from '../../src/cli/components/theme';

describe('PreflightView', () => {
  test('renders the four step states with the right marker', () => {
    const { lastFrame, unmount } = render(
      <PreflightView
        steps={[
          { id: 'chrome', label: 'Chrome', state: 'ok' },
          { id: 'daemon', label: 'Daemon', state: 'running' },
          { id: 'remote', label: 'Remote preflight', state: 'pending' },
          { id: 'extra', label: 'Extra', state: 'error' },
        ]}
      />,
    );
    const out = lastFrame()!;
    // ok step shows the figures tick + label.
    expect(out).toContain(icons.tick);
    expect(out).toContain('Chrome');
    // running step shows an animated spinner (initial frame on mount)
    // alongside the label.
    expect(out).toContain(spinnerFrames[0]!);
    expect(out).toContain('Daemon');
    // pending step at minimum surfaces its label.
    expect(out).toContain('Remote preflight');
    // error step shows the figures cross + label.
    expect(out).toContain(icons.cross);
    expect(out).toContain('Extra');
    unmount();
  });

  test('error message is shown indented under the failed step', () => {
    const { lastFrame, unmount } = render(
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
    expect(out).toContain(icons.cross);
    expect(out).toContain('Remote preflight');
    expect(out).toContain('socat not installed');
    unmount();
  });

  test('warning shows the warning icon under an ok step', () => {
    const { lastFrame, unmount } = render(
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
    expect(out).toContain(icons.tick);
    expect(out).toContain(icons.warning);
    expect(out).toContain('cannot verify sshd StreamLocalBindUnlink');
    unmount();
  });
});
