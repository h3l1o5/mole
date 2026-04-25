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

import {
  layoutBreadcrumb,
  type BreadcrumbSegment,
} from '../../../src/cli/wizard/layout';
import type { WizardStep } from '../../../src/cli/wizard/reducer';

// Helper: extract just the value segments and their tones, in order.
function valuePairs(
  segments: BreadcrumbSegment[],
): { text: string; tone: 'normal' | 'warning' | 'dim' }[] {
  return segments.flatMap((s) =>
    s.kind === 'value' ? [{ text: s.text, tone: s.tone }] : [],
  );
}

// Helper: extract step labels with the kind tag, in order.
function stepLabels(
  segments: BreadcrumbSegment[],
): { kind: 'label' | 'currentLabel'; text: string }[] {
  return segments.flatMap((s) =>
    s.kind === 'label' || s.kind === 'currentLabel'
      ? [{ kind: s.kind, text: s.text }]
      : [],
  );
}

function fitted(
  step: WizardStep,
  hostName: string | null,
  profileName: string | 'skip' | null,
) {
  const r = layoutBreadcrumb({ step, hostName, profileName }, 80);
  if (r.mode === 'fallback') {
    throw new Error('expected wide breadcrumb, got fallback');
  }
  return r;
}

// Truth table: every (step × hostName × profileName) combination that
// the reducer can actually produce, mapped to the expected value
// visibility and tone. Each row is one regression-anchored test.
describe('layoutBreadcrumb — value visibility truth table', () => {
  test('host step / no selections / no values', () => {
    const r = fitted('host', null, null);
    expect(valuePairs(r.segments)).toEqual([]);
    expect(stepLabels(r.segments)).toEqual([
      { kind: 'currentLabel', text: 'Host' },
      { kind: 'label', text: 'Profile' },
      { kind: 'label', text: 'Review' },
    ]);
  });

  test('host step / hostName set (back from profile) / host shown dim', () => {
    const r = fitted('host', 'vbm', null);
    expect(valuePairs(r.segments)).toEqual([{ text: 'vbm', tone: 'dim' }]);
  });

  test('host step / both set (back from review) / only host dim, no profile', () => {
    // Future steps must never leak their value — profile is future here.
    const r = fitted('host', 'vbm', 'agent');
    expect(valuePairs(r.segments)).toEqual([{ text: 'vbm', tone: 'dim' }]);
  });

  test('host step / profile=skip (back from review) / only host dim, no skipped', () => {
    const r = fitted('host', 'vbm', 'skip');
    expect(valuePairs(r.segments)).toEqual([{ text: 'vbm', tone: 'dim' }]);
  });

  test('profile step / first time / host normal, no profile', () => {
    const r = fitted('profile', 'vbm', null);
    expect(valuePairs(r.segments)).toEqual([
      { text: 'vbm', tone: 'normal' },
    ]);
  });

  test('profile step / back from review (agent) / host normal, profile dim', () => {
    const r = fitted('profile', 'vbm', 'agent');
    expect(valuePairs(r.segments)).toEqual([
      { text: 'vbm', tone: 'normal' },
      { text: 'agent', tone: 'dim' },
    ]);
  });

  test('profile step / back from review (skip) / host normal, skipped dim', () => {
    const r = fitted('profile', 'vbm', 'skip');
    expect(valuePairs(r.segments)).toEqual([
      { text: 'vbm', tone: 'normal' },
      { text: 'skipped', tone: 'dim' },
    ]);
  });

  test('review step / agent / host normal, agent normal', () => {
    const r = fitted('review', 'vbm', 'agent');
    expect(valuePairs(r.segments)).toEqual([
      { text: 'vbm', tone: 'normal' },
      { text: 'agent', tone: 'normal' },
    ]);
  });

  test('review step / skip / host normal, skipped warning', () => {
    const r = fitted('review', 'vbm', 'skip');
    expect(valuePairs(r.segments)).toEqual([
      { text: 'vbm', tone: 'normal' },
      { text: 'skipped', tone: 'warning' },
    ]);
  });

  test('current step is always tagged currentLabel; others stay label', () => {
    for (const step of ['host', 'profile', 'review'] as const) {
      const r = fitted(step, step === 'host' ? null : 'vbm', step === 'review' ? 'agent' : null);
      const labels = stepLabels(r.segments);
      const current = labels.find((l) => l.kind === 'currentLabel');
      expect(current?.text.toLowerCase()).toBe(step);
      // Exactly one currentLabel.
      expect(labels.filter((l) => l.kind === 'currentLabel').length).toBe(1);
    }
  });
});

describe('layoutBreadcrumb — width adaptation', () => {
  test('truncates host value when overflowing', () => {
    const r = layoutBreadcrumb(
      {
        step: 'review',
        hostName: 'alice@verylonghost.example.com',
        profileName: 'work-account-test',
      },
      64,
    );
    if (r.mode === 'fallback') throw new Error();
    const hostValue = r.segments.find(
      (s) => s.kind === 'value' && s.text.startsWith('alice@'),
    );
    expect(hostValue?.text.endsWith('…')).toBe(true);
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
    if (r.mode !== 'fallback') throw new Error();
    expect(r.text).toBe('2/3 · Profile');
  });

  test('fallback step counter on host step (innerWidth=20)', () => {
    // Pure labels alone are 23 cols (Host › Profile › Review with short
    // separator); innerWidth=20 forces fallback regardless of values.
    const r = layoutBreadcrumb(
      { step: 'host', hostName: null, profileName: null },
      20,
    );
    if (r.mode !== 'fallback') throw new Error();
    expect(r.text).toBe('1/3 · Host');
  });

  test('truncation preserves tone (host dim stays dim)', () => {
    // When the user navigates back to the host step with a long host
    // already chosen, the host value should still be tone=dim even
    // after width-driven truncation.
    const r = layoutBreadcrumb(
      {
        step: 'host',
        hostName: 'alice@verylonghost.example.com',
        profileName: null,
      },
      40,
    );
    if (r.mode === 'fallback') return; // separately covered above
    const hostValue = r.segments.find(
      (s) => s.kind === 'value' && s.text.startsWith('alice@'),
    );
    expect(hostValue?.kind === 'value' && hostValue.tone).toBe('dim');
  });
});
