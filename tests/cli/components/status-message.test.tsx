import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { StatusMessage } from '../../../src/cli/components/status-message';
import { icons } from '../../../src/cli/components/theme';

describe('StatusMessage', () => {
  test('info variant shows info icon and message', () => {
    const { lastFrame, unmount } = render(
      <StatusMessage variant="info">all systems normal</StatusMessage>,
    );
    const out = lastFrame()!;
    expect(out).toContain(icons.info);
    expect(out).toContain('all systems normal');
    unmount();
  });

  test('success variant shows tick icon', () => {
    const { lastFrame, unmount } = render(
      <StatusMessage variant="success">done</StatusMessage>,
    );
    expect(lastFrame()).toContain(icons.tick);
    unmount();
  });

  test('warning variant shows warning icon', () => {
    const { lastFrame, unmount } = render(
      <StatusMessage variant="warning">heads up</StatusMessage>,
    );
    expect(lastFrame()).toContain(icons.warning);
    unmount();
  });

  test('error variant shows cross icon', () => {
    const { lastFrame, unmount } = render(
      <StatusMessage variant="error">fatal</StatusMessage>,
    );
    expect(lastFrame()).toContain(icons.cross);
    unmount();
  });
});
