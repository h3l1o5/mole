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

// Arrow march cycles a horizontal build-up that points at a CTA.
// Each frame is right-padded to 3 cells so the consumer Box never
// reflows when the frame index changes; the trailing blank frame gives
// the cycle a brief "breathe" before restarting. ▸ (U+25B8) is the
// 1-cell variant — ▶ (U+25B6) measures as width=2 in string-width and
// would wrap inside a 3-cell Box on real terminals.
export const arrowMarchFrames = ['▸  ', '▸▸ ', '▸▸▸', '   '];

export const breathing = {
  primary: { base: '#005f87', peak: '#5fffff' },
} as const;
