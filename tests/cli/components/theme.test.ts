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

  test('icons mostly pass through figures, except width-glitch overrides', () => {
    // Pass-throughs.
    expect(icons.cross).toBe(figures.cross);
    expect(icons.info).toBe(figures.info);
    expect(icons.pointer).toBe(figures.pointer);
    expect(icons.pointerSmall).toBe(figures.pointerSmall);
    expect(icons.ellipsis).toBe(figures.ellipsis);
    // figures.tick / figures.warning measure as width=2 in string-width
    // but render as 1 column; we override with width=1 alternates so
    // <Box gap={1}> spacing stays uniform across markers.
    expect(icons.tick).toBe('✓');
    expect(icons.warning).toBe('△');
  });

  test('spinnerFrames is a non-empty animation sequence', () => {
    expect(Array.isArray(spinnerFrames)).toBe(true);
    expect(spinnerFrames.length).toBeGreaterThan(4);
  });
});
