import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import {
  BreathingText,
  buildKeyframes,
  buildTriangle,
} from '../../../src/cli/components/breathing-text';

describe('buildKeyframes', () => {
  test('start and end match base / peak', () => {
    const k = buildKeyframes('#000000', '#ffffff', 5);
    expect(k[0]).toBe('#000000');
    expect(k[4]).toBe('#ffffff');
  });

  test('linearly interpolates middle frames', () => {
    const k = buildKeyframes('#000000', '#ffffff', 3);
    expect(k).toEqual(['#000000', '#808080', '#ffffff']);
  });

  test('produces exactly `steps` keyframes', () => {
    expect(buildKeyframes('#000000', '#ffffff', 8)).toHaveLength(8);
  });
});

describe('buildTriangle', () => {
  test('forward then backward without endpoint duplication', () => {
    expect(buildTriangle(4)).toEqual([0, 1, 2, 3, 2, 1]);
  });

  test('length is 2*(steps-1)', () => {
    expect(buildTriangle(8)).toHaveLength(14);
  });

  test('handles steps=2 (degenerate but valid)', () => {
    expect(buildTriangle(2)).toEqual([0, 1]);
  });
});

describe('<BreathingText>', () => {
  test('renders the children text', () => {
    const { lastFrame, unmount } = render(
      <BreathingText>READY TO TUNNEL</BreathingText>,
    );
    expect(lastFrame() ?? '').toContain('READY TO TUNNEL');
    unmount();
  });

  test('frozen=true does not change frame across time', async () => {
    const { lastFrame, unmount } = render(
      <BreathingText frozen periodMs={50}>
        X
      </BreathingText>,
    );
    const f0 = lastFrame();
    await new Promise((r) => setTimeout(r, 120));
    const f1 = lastFrame();
    expect(f0).toBe(f1);
    unmount();
  });

  test('frozen=true still shows the children', () => {
    const { lastFrame, unmount } = render(
      <BreathingText frozen>READY</BreathingText>,
    );
    expect(lastFrame() ?? '').toContain('READY');
    unmount();
  });
});
