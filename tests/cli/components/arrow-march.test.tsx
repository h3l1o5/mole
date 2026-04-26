import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { ArrowMarch } from '../../../src/cli/components/arrow-march';

describe('<ArrowMarch>', () => {
  test('renders an arrow glyph initially', () => {
    const { lastFrame, unmount } = render(<ArrowMarch />);
    expect(lastFrame() ?? '').toMatch(/[▷▶]/);
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
