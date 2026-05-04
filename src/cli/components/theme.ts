export const colors = {
  primary: 'cyan',
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'blue',
} as const;

// All glyphs are printable ASCII. Unicode alternates (✓, ⠋, △, ❯, etc.)
// render at inconsistent vertical positions and widths across terminal
// fonts, breaking marker→label alignment. ASCII characters all sit on the
// baseline at width 1, so the layout stays stable everywhere.
export const icons = {
  tick: 'v',
  cross: 'x',
  info: 'i',
  warning: '!',
  pointer: '>',
  pointerSmall: '>',
  ellipsis: '...',
  bullet: '*',
  arrowRight: '->',
} as const;

// Decorative bars flanking the review title. Kept here so future glyph
// swaps don't require greping every consumer.
export const decoration = {
  titleBarLeft: '|',
  titleBarRight: '|',
} as const;

export const spinnerFrames = ['|', '/', '-', '\\'];

export const colorPhase = {
  primary: { base: '#5fffff', peak: '#5fff87' },
} as const;
