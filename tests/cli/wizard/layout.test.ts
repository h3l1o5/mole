import { test, expect, describe } from 'bun:test';
import {
  truncate,
  computeWizardWidth,
  isFallbackMode,
} from '../../../src/cli/wizard/layout';

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

import { layoutBreadcrumb } from '../../../src/cli/wizard/layout';

describe('layoutBreadcrumb', () => {
  test('full mode for ample width, no value when not yet selected', () => {
    const r = layoutBreadcrumb(
      { step: 'host', hostName: null, profileName: null },
      80,
    );
    expect(r.mode).toBe('full');
    if (r.mode === 'fallback') throw new Error();
    // Current step (host) is bold-cyan; future steps dim.
    const labels = r.segments
      .filter((s) => s.kind === 'currentLabel' || s.kind === 'label')
      .map((s) => s.text);
    expect(labels).toEqual(['Host', 'Profile', 'Review']);
    // No value segments yet.
    expect(r.segments.find((s) => s.kind === 'value')).toBeUndefined();
  });

  test('full mode shows host value once host picked', () => {
    const r = layoutBreadcrumb(
      { step: 'profile', hostName: 'vbm', profileName: null },
      80,
    );
    expect(r.mode).toBe('full');
    if (r.mode === 'fallback') throw new Error();
    const values = r.segments
      .filter((s) => s.kind === 'value')
      .map((s) => s.text);
    expect(values).toEqual(['vbm']);
  });

  test("'skipped' value uses tone=warning", () => {
    const r = layoutBreadcrumb(
      { step: 'review', hostName: 'vbm', profileName: 'skip' },
      80,
    );
    if (r.mode === 'fallback') throw new Error();
    const skip = r.segments.find(
      (s) => s.kind === 'value' && s.text === 'skipped',
    );
    expect(skip?.kind === 'value' && skip.tone).toBe('warning');
  });

  test('truncates host value when overflowing', () => {
    const r = layoutBreadcrumb(
      {
        step: 'review',
        hostName: 'alice@verylonghost.example.com',
        profileName: 'work-account-test',
      },
      64, // tight enough to require host truncation
    );
    if (r.mode === 'fallback') throw new Error();
    const hostValue = r.segments.find(
      (s) => s.kind === 'value' && s.text.startsWith('alice@'),
    );
    expect(hostValue?.text.endsWith('…')).toBe(true);
    // Profile should still be intact at this width.
    expect(
      r.segments.find(
        (s) => s.kind === 'value' && s.text === 'work-account-test',
      ),
    ).toBeDefined();
  });

  test('switches to short separator when full no longer fits', () => {
    const r = layoutBreadcrumb(
      {
        step: 'review',
        hostName: 'alice@verylonghost.example.com',
        profileName: 'work-account-test',
      },
      44,
    );
    expect(r.mode).toBe('short');
  });

  test('falls back to step counter when nothing fits', () => {
    const r = layoutBreadcrumb(
      {
        step: 'profile',
        hostName: 'alice@verylonghost.example.com',
        profileName: null,
      },
      30,
    );
    expect(r.mode).toBe('fallback');
    if (r.mode !== 'fallback') throw new Error();
    expect(r.text).toBe('2/3 · Profile');
  });

  test('fallback step counter on host step', () => {
    // Pure labels are 23 cols (Host › Profile › Review with short sep).
    // innerWidth=20 forces fallback even with no values to truncate.
    const r = layoutBreadcrumb(
      { step: 'host', hostName: null, profileName: null },
      20,
    );
    if (r.mode !== 'fallback') throw new Error();
    expect(r.text).toBe('1/3 · Host');
  });
});
