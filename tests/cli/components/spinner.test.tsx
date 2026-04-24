import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { Spinner } from '../../../src/cli/components/spinner';
import { spinnerFrames } from '../../../src/cli/components/theme';

describe('Spinner', () => {
  test('renders the first frame on mount', () => {
    const { lastFrame, unmount } = render(<Spinner />);
    const out = lastFrame()!;
    expect(out).toContain(spinnerFrames[0]!);
    unmount();
  });

  test('accepts and respects a color prop without throwing', () => {
    // We can't easily assert ANSI color in snapshot-free tests, but we can
    // at least verify the component renders with a color prop supplied.
    const { lastFrame, unmount } = render(<Spinner color="green" />);
    expect(lastFrame()).toContain(spinnerFrames[0]!);
    unmount();
  });
});
