import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { Badge } from '../../../src/cli/components/badge';

describe('Badge', () => {
  test('uppercases label and pads the leading edge with a space', () => {
    const { lastFrame, unmount } = render(<Badge color="cyan">new</Badge>);
    // lastFrame trims trailing whitespace on a line, so we can only
    // assert the leading space. The trailing space still renders in
    // a real terminal because the background color extends past it.
    expect(lastFrame()).toMatch(/ NEW/);
    unmount();
  });

  test('renders without throwing across different color props', () => {
    const { lastFrame, unmount } = render(<Badge color="green">ready</Badge>);
    expect(lastFrame()).toMatch(/ READY/);
    unmount();
  });
});
