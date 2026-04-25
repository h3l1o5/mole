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
