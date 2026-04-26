import figures from 'figures';

export const colors = {
  primary: 'cyan',
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'blue',
} as const;

// figures.tick (✔ U+2714) and figures.warning (⚠ U+26A0) measure as
// width=2 in string-width but render as 1 column in real terminals. Box
// gap={1} then inserts an extra space, breaking marker→label alignment.
// Use the light variants which measure consistently as width=1.
export const icons = {
  tick: '✓',
  cross: figures.cross,
  info: figures.info,
  warning: '△',
  pointer: figures.pointer,
  pointerSmall: figures.pointerSmall,
  ellipsis: figures.ellipsis,
  bullet: figures.bullet,
  arrowRight: '→',
} as const;

// Decorative bars flanking the review title. Kept here so future glyph
// swaps don't require greping every consumer.
export const decoration = {
  titleBarLeft: '▌',
  titleBarRight: '▐',
} as const;

export const spinnerFrames = [
  '⠋',
  '⠙',
  '⠹',
  '⠸',
  '⠼',
  '⠴',
  '⠦',
  '⠧',
  '⠇',
  '⠏',
];

// Arrow march cycles a 1→2→3-glyph build-up to point at a CTA.
// Widths intentionally vary to create the "marching forward" effect;
// callers wrap this in a fixed-width Box to absorb the variance.
export const arrowMarchFrames = ['▷', '▶', '▶▶', '▶▶▶'];

export const breathing = {
  primary: { base: '#005f87', peak: '#5fffff' },
} as const;
