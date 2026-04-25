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
