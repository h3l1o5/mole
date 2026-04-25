import stringWidth from 'string-width';

const ELLIPSIS = '…';

// Truncate `s` so its visual width is <= maxWidth, appending an
// ellipsis if anything was removed. Width is measured in terminal
// columns (handles CJK / emoji), not chars.
export function truncate(s: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (stringWidth(s) <= maxWidth) return s;
  if (maxWidth === 1) return ELLIPSIS;

  const budget = maxWidth - 1; // reserve 1 col for the ellipsis
  let out = '';
  let used = 0;
  for (const ch of s) {
    const w = stringWidth(ch);
    if (used + w > budget) break;
    out += ch;
    used += w;
  }
  return out + ELLIPSIS;
}

export const WIZARD_MIN_WIDTH = 56;
export const WIZARD_MAX_WIDTH = 80;
export const FALLBACK_THRESHOLD = 50;

// Wizard outer width given the terminal width. We subtract 4 cols of
// breathing room (2 cols margin on each side) and clamp to the
// readable range.
export function computeWizardWidth(terminalWidth: number): number {
  const target = terminalWidth - 4;
  if (target < WIZARD_MIN_WIDTH) return WIZARD_MIN_WIDTH;
  if (target > WIZARD_MAX_WIDTH) return WIZARD_MAX_WIDTH;
  return target;
}

// Below this we abandon the bordered wizard and render a plain
// step-counter + content. The full breadcrumb won't fit even with
// short separators, so the visual scaffolding becomes more
// distracting than helpful.
export function isFallbackMode(terminalWidth: number): boolean {
  return terminalWidth < FALLBACK_THRESHOLD;
}

import type { WizardStep } from './reducer';

export type BreadcrumbInput = {
  step: WizardStep;
  hostName: string | null;
  // 'skip' | actual profile name | null when not picked
  profileName: string | 'skip' | null;
};

export type BreadcrumbSegment =
  | { kind: 'label'; text: string }
  | { kind: 'currentLabel'; text: string }
  | { kind: 'value'; text: string; tone: 'normal' | 'warning' | 'dim' }
  | { kind: 'separator'; text: string };

export type BreadcrumbLayout =
  | { mode: 'full' | 'short'; segments: BreadcrumbSegment[] }
  | { mode: 'fallback'; text: string };

const STEP_NAMES = {
  host: 'Host',
  profile: 'Profile',
  review: 'Review',
} as const;
const STEP_ORDER: WizardStep[] = ['host', 'profile', 'review'];
const MIN_VALUE = 8;

interface ValuePlan {
  hostValue: string | null;
  profileValue: string | null;
  profileTone: 'normal' | 'warning' | 'dim';
}

function planValues(input: BreadcrumbInput): ValuePlan {
  const hostValue = input.hostName ?? null;
  let profileValue: string | null = null;
  let profileTone: ValuePlan['profileTone'] = 'normal';
  if (input.profileName === 'skip') {
    profileValue = 'skipped';
    profileTone = 'warning';
  } else if (input.profileName != null) {
    profileValue = input.profileName;
  }
  if (input.step === 'profile' && profileValue) {
    profileTone = 'dim';
  }
  if (input.step === 'host') {
    return { hostValue: null, profileValue, profileTone };
  }
  return { hostValue, profileValue, profileTone };
}

function buildSegments(
  input: BreadcrumbInput,
  values: ValuePlan,
  separator: string,
): BreadcrumbSegment[] {
  const seg: BreadcrumbSegment[] = [];
  for (let i = 0; i < STEP_ORDER.length; i++) {
    const s = STEP_ORDER[i]!;
    const name = STEP_NAMES[s];
    if (s === input.step) {
      seg.push({ kind: 'currentLabel', text: name });
    } else {
      seg.push({ kind: 'label', text: name });
    }
    if (s === 'host' && values.hostValue) {
      seg.push({ kind: 'value', text: values.hostValue, tone: 'normal' });
    }
    if (s === 'profile' && values.profileValue) {
      seg.push({
        kind: 'value',
        text: values.profileValue,
        tone: values.profileTone,
      });
    }
    if (i < STEP_ORDER.length - 1) {
      seg.push({ kind: 'separator', text: separator });
    }
  }
  return seg;
}

function segmentsWidth(seg: BreadcrumbSegment[]): number {
  let total = 0;
  for (const s of seg) total += stringWidth(s.text);
  // value segments are joined by a single space to their preceding label;
  // count one extra col per value segment.
  total += seg.filter((s) => s.kind === 'value').length;
  return total;
}

function tryFit(
  input: BreadcrumbInput,
  innerWidth: number,
  separator: ' › ' | '  ›  ',
): BreadcrumbSegment[] | null {
  const values = planValues(input);

  const tryWith = (h: string | null, p: string | null) =>
    buildSegments(
      input,
      { ...values, hostValue: h, profileValue: p },
      separator,
    );

  let segs = tryWith(values.hostValue, values.profileValue);
  if (segmentsWidth(segs) <= innerWidth) return segs;

  if (values.hostValue && stringWidth(values.hostValue) > MIN_VALUE) {
    let lo = MIN_VALUE;
    let hi = stringWidth(values.hostValue);
    let bestHost: string | null = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const candidate = truncate(values.hostValue, mid);
      const w = segmentsWidth(tryWith(candidate, values.profileValue));
      if (w <= innerWidth) {
        bestHost = candidate;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (bestHost) return tryWith(bestHost, values.profileValue);
  }

  const minHost = values.hostValue
    ? truncate(values.hostValue, MIN_VALUE)
    : null;
  if (values.profileValue && stringWidth(values.profileValue) > MIN_VALUE) {
    let lo = MIN_VALUE;
    let hi = stringWidth(values.profileValue);
    let bestProfile: string | null = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const candidate = truncate(values.profileValue, mid);
      const w = segmentsWidth(tryWith(minHost, candidate));
      if (w <= innerWidth) {
        bestProfile = candidate;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (bestProfile) return tryWith(minHost, bestProfile);
  }

  const minProfile = values.profileValue
    ? truncate(values.profileValue, MIN_VALUE)
    : null;
  segs = tryWith(minHost, minProfile);
  return segmentsWidth(segs) <= innerWidth ? segs : null;
}

export function layoutBreadcrumb(
  input: BreadcrumbInput,
  innerWidth: number,
): BreadcrumbLayout {
  const full = tryFit(input, innerWidth, '  ›  ');
  if (full) return { mode: 'full', segments: full };
  const short = tryFit(input, innerWidth, ' › ');
  if (short) return { mode: 'short', segments: short };
  const stepIndex = STEP_ORDER.indexOf(input.step) + 1;
  return {
    mode: 'fallback',
    text: `${stepIndex}/${STEP_ORDER.length} · ${STEP_NAMES[input.step]}`,
  };
}
