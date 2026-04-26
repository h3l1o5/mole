import React from 'react';
import { test, expect, describe } from 'bun:test';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import {
  buildKeyframes,
  buildTriangle,
  usePhaseColor,
  type PhaseColorOptions,
} from '../../../src/cli/components/phase-color';

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

const Probe: React.FC<{ opts?: PhaseColorOptions }> = ({ opts }) => {
  const color = usePhaseColor(opts);
  return <Text>{color ?? 'FROZEN'}</Text>;
};

describe('usePhaseColor', () => {
  test('returns a hex color when not frozen', () => {
    const { lastFrame, unmount } = render(<Probe />);
    expect(lastFrame() ?? '').toMatch(/#[0-9a-fA-F]{6}/);
    unmount();
  });

  test('returns undefined when frozen', () => {
    const { lastFrame, unmount } = render(<Probe opts={{ frozen: true }} />);
    expect(lastFrame() ?? '').toContain('FROZEN');
    unmount();
  });

  test('frozen=true does not advance the color across time', async () => {
    const { lastFrame, unmount } = render(
      <Probe opts={{ frozen: true, periodMs: 50 }} />,
    );
    const f0 = lastFrame();
    await new Promise((r) => setTimeout(r, 120));
    const f1 = lastFrame();
    expect(f0).toBe(f1);
    unmount();
  });
});
