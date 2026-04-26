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
        ]}
      />,
    );
    const out = lastFrame()!;
    expect(out).toContain(icons.tick);
    expect(out).toContain('Chrome');
    expect(out).toContain(spinnerFrames[0]!);
    expect(out).toContain('Daemon');
    expect(out).toContain('Remote preflight');
    unmount();
  });

  test('error step shows the cross marker and the error message indented under it', () => {
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

  // Layout regression guard. We render two trailing spaces after every
  // marker, not one: some terminal fonts paint the marker glyph (e.g.
  // ✓ U+2713) wide enough to swallow a single trailing space, leaving
  // marker and label visually touching. Two spaces survives that and
  // keeps alignment uniform across pending / running / ok / error.
  test('every marker leaves exactly two spaces before the label', () => {
    const states = ['pending', 'running', 'ok', 'error'] as const;
    for (const state of states) {
      const { lastFrame, unmount } = render(
        <PreflightView steps={[{ id: 'daemon', label: 'LABEL', state }]} />,
      );
      const out = lastFrame()!;
      // paddingLeft={2} + marker (1 char) + 2 spaces + label.
      expect(out).toMatch(/^ {2}\S {2}LABEL$/);
      unmount();
    }
  });

  test('warning sub-row leaves exactly two spaces before the message', () => {
    const { lastFrame, unmount } = render(
      <PreflightView
        steps={[
          { id: 'remote', label: 'L', state: 'ok', warning: 'WARN' },
        ]}
      />,
    );
    const out = lastFrame()!;
    // outer paddingLeft={2} + warning paddingLeft={2} + icon + 2 spaces + WARN.
    expect(out).toMatch(/^ {4}\S {2}WARN$/m);
    unmount();
  });
});
