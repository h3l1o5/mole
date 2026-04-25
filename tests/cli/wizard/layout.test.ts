import { test, expect, describe } from 'bun:test';
import { truncate } from '../../../src/cli/wizard/layout';

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
