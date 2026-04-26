import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { ArrowMarch } from '../../../src/cli/components/arrow-march';

describe('<ArrowMarch>', () => {
  test('renders an arrow glyph initially (or the blank pause frame)', () => {
    const { lastFrame, unmount } = render(<ArrowMarch />);
    // Frames are ▸-based with a blank pause; just verify it renders.
    expect(lastFrame() ?? '').not.toBe('');
    unmount();
  });

  test('cycles through different frames over time', async () => {
    const { lastFrame, unmount } = render(<ArrowMarch intervalMs={20} />);
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      seen.add(lastFrame() ?? '');
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
    unmount();
  });
});
