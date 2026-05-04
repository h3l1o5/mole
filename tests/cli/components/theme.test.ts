import { test, expect, describe } from 'bun:test';
import stringWidth from 'string-width';
import {
  colors,
  icons,
  spinnerFrames,
  colorPhase,
  decoration,
} from '../../../src/cli/components/theme';

const ASCII_PRINTABLE = /^[\x20-\x7E]+$/;

describe('theme', () => {
  test('colors exposes the five semantic slots used by the design language', () => {
    expect(colors.primary).toBeDefined();
    expect(colors.success).toBeDefined();
    expect(colors.error).toBeDefined();
    expect(colors.warning).toBeDefined();
    expect(colors.info).toBeDefined();
  });

  test('every icon is printable ASCII so it renders consistently across fonts', () => {
    for (const value of Object.values(icons)) {
      expect(value).toMatch(ASCII_PRINTABLE);
    }
  });

  test('single-glyph icons measure width 1', () => {
    const singles = [
      icons.tick,
      icons.cross,
      icons.info,
      icons.warning,
      icons.pointer,
      icons.pointerSmall,
      icons.bullet,
    ];
    for (const glyph of singles) {
      expect(stringWidth(glyph)).toBe(1);
    }
  });

  test('spinnerFrames is a non-empty animation sequence', () => {
    expect(Array.isArray(spinnerFrames)).toBe(true);
    expect(spinnerFrames.length).toBeGreaterThan(2);
  });

  test('every spinner frame is printable ASCII so it renders width 1 across fonts', () => {
    for (const frame of spinnerFrames) {
      expect(frame).toMatch(ASCII_PRINTABLE);
      expect(stringWidth(frame)).toBe(1);
    }
  });

  test('every decoration glyph is printable ASCII width 1', () => {
    for (const value of Object.values(decoration)) {
      expect(value).toMatch(ASCII_PRINTABLE);
      expect(stringWidth(value)).toBe(1);
    }
  });

  test('colorPhase exposes a primary keyframe pair as 6-digit hex strings', () => {
    expect(colorPhase.primary.base).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(colorPhase.primary.peak).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
