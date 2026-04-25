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

  // Layout regression guard: figures.tick (✔ U+2714) and figures.warning
  // (⚠ U+26A0) measure as width=2 in string-width but render as 1 column,
  // which makes Box gap={1} insert an extra ASCII space. All marker glyphs
  // we ship must measure as width=1 so the marker→label gap is uniform
  // across states.
  test('every marker leaves exactly one space before the label', () => {
    const states = ['pending', 'running', 'ok', 'error'] as const;
    for (const state of states) {
      const { lastFrame, unmount } = render(
        <PreflightView steps={[{ id: 's', label: 'LABEL', state }]} />,
      );
      const out = lastFrame()!;
      // paddingLeft={2} + marker (1 char) + gap=1 (1 space) + label.
      expect(out).toMatch(/^ {2}\S LABEL$/);
      unmount();
    }
  });

  test('warning sub-row leaves exactly one space before the message', () => {
    const { lastFrame, unmount } = render(
      <PreflightView
        steps={[
          { id: 'r', label: 'L', state: 'ok', warning: 'WARN' },
        ]}
      />,
    );
    const out = lastFrame()!;
    // paddingLeft={2} (outer) + paddingLeft={2} (warning row) + icon + 1 + WARN.
    expect(out).toMatch(/^ {4}\S WARN$/m);
    unmount();
  });
});
