import figures from 'figures';

export const colors = {
  primary: 'cyan',
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'blue',
} as const;

export const icons = {
  tick: figures.tick,
  cross: figures.cross,
  info: figures.info,
  warning: figures.warning,
  pointer: figures.pointer,
  pointerSmall: figures.pointerSmall,
  ellipsis: figures.ellipsis,
  bullet: figures.bullet,
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
