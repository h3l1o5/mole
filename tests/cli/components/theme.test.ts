import { test, expect, describe } from 'bun:test';
import figures from 'figures';
import { colors, icons, spinnerFrames } from '../../../src/cli/components/theme';

describe('theme', () => {
  test('colors exposes the five semantic slots used by the design language', () => {
    expect(colors.primary).toBeDefined();
    expect(colors.success).toBeDefined();
    expect(colors.error).toBeDefined();
    expect(colors.warning).toBeDefined();
    expect(colors.info).toBeDefined();
  });

  test('icons are sourced from figures (so Windows falls back automatically)', () => {
    expect(icons.tick).toBe(figures.tick);
    expect(icons.cross).toBe(figures.cross);
    expect(icons.info).toBe(figures.info);
    expect(icons.warning).toBe(figures.warning);
    expect(icons.pointer).toBe(figures.pointer);
    expect(icons.pointerSmall).toBe(figures.pointerSmall);
    expect(icons.ellipsis).toBe(figures.ellipsis);
  });

  test('spinnerFrames is a non-empty animation sequence', () => {
    expect(Array.isArray(spinnerFrames)).toBe(true);
    expect(spinnerFrames.length).toBeGreaterThan(4);
  });
});
