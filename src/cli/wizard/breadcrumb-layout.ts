import stringWidth from 'string-width';
import type { WizardStep } from './reducer';
import { truncate } from './width';

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

type Tone = 'normal' | 'warning' | 'dim';

interface ValuePlan {
  hostValue: string | null;
  hostTone: Tone;
  profileValue: string | null;
  profileTone: Tone;
}

// Decide which step values appear in the breadcrumb and in what tone.
// One row per cell of the (step × hostName × profileName) truth table:
//
//   step    │ host         │ profile
//   ────────┼──────────────┼─────────────
//   host    │ dim if set   │ hidden  (future step)
//   profile │ normal       │ dim if set (back from review)
//   review  │ normal       │ normal / warning(skipped)
function planValues(input: BreadcrumbInput): ValuePlan {
  const { step, hostName, profileName } = input;
  const plan: ValuePlan = {
    hostValue: null,
    hostTone: 'normal',
    profileValue: null,
    profileTone: 'normal',
  };

  if (hostName) {
    if (step === 'host') {
      plan.hostValue = hostName;
      plan.hostTone = 'dim';
    } else {
      // step === 'profile' or 'review' → host is past
      plan.hostValue = hostName;
      plan.hostTone = 'normal';
    }
  }

  if (profileName != null) {
    const display = profileName === 'skip' ? 'skipped' : profileName;
    if (step === 'review') {
      plan.profileValue = display;
      plan.profileTone = profileName === 'skip' ? 'warning' : 'normal';
    } else if (step === 'profile') {
      plan.profileValue = display;
      plan.profileTone = 'dim';
    }
    // step === 'host' → profile is future, leave hidden.
  }

  return plan;
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
      seg.push({
        kind: 'value',
        text: values.hostValue,
        tone: values.hostTone,
      });
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

function fitSegmentsWithin(
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

// Render contract: between a `label` / `currentLabel` segment and its
// following `value` segment, the renderer MUST insert exactly one space.
// Width budgeting in this module assumes that exact spacing.
export function layoutBreadcrumb(
  input: BreadcrumbInput,
  innerWidth: number,
): BreadcrumbLayout {
  const full = fitSegmentsWithin(input, innerWidth, '  ›  ');
  if (full) return { mode: 'full', segments: full };
  const short = fitSegmentsWithin(input, innerWidth, ' › ');
  if (short) return { mode: 'short', segments: short };
  const stepIndex = STEP_ORDER.indexOf(input.step) + 1;
  return {
    mode: 'fallback',
    text: `${stepIndex}/${STEP_ORDER.length} · ${STEP_NAMES[input.step]}`,
  };
}
