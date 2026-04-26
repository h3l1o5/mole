import { test, expect, describe } from 'bun:test';
import {
  truncate,
  computeWizardWidth,
  isFallbackMode,
} from '../../../src/cli/wizard/width';

describe('truncate', () => {
  test('returns the string unchanged when it fits', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('hello', 5)).toBe('hello');
  });

  test('truncates with ellipsis when too long', () => {
    expect(truncate('hello world', 8)).toBe('hello w…');
  });

  test('reserves 1 col for ellipsis (output width <= maxWidth)', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abcdef', 1)).toBe('…');
  });

  test('returns empty string for maxWidth <= 0', () => {
    expect(truncate('abc', 0)).toBe('');
    expect(truncate('abc', -1)).toBe('');
  });

  test('CJK characters count as width 2', () => {
    // '繁中abc' is 7 cols. maxWidth=4 → must truncate; budget=3 fits '繁'.
    expect(truncate('繁中abc', 4)).toBe('繁…');
    expect(truncate('繁中abc', 5)).toBe('繁中…');
    expect(truncate('繁中', 4)).toBe('繁中');
  });

  test('handles empty input', () => {
    expect(truncate('', 5)).toBe('');
  });
});

describe('computeWizardWidth', () => {
  test('clamps below MIN', () => {
    expect(computeWizardWidth(40)).toBe(56);
    expect(computeWizardWidth(56)).toBe(56);
  });

  test('clamps above MAX', () => {
    expect(computeWizardWidth(200)).toBe(80);
    expect(computeWizardWidth(84)).toBe(80);
  });

  test('subtracts 4 cols of breathing room in between', () => {
    expect(computeWizardWidth(70)).toBe(66);
    expect(computeWizardWidth(80)).toBe(76);
    expect(computeWizardWidth(60)).toBe(56);
  });
});

describe('isFallbackMode', () => {
  test('true when terminal narrower than 50 cols', () => {
    expect(isFallbackMode(49)).toBe(true);
    expect(isFallbackMode(20)).toBe(true);
  });

  test('false from 50 cols upward', () => {
    expect(isFallbackMode(50)).toBe(false);
    expect(isFallbackMode(80)).toBe(false);
  });
});
