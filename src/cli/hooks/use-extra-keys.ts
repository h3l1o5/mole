import { useEffect } from 'react';
import { useStdin } from 'ink';

// Ink's `useInput` hook drops Home / End on the floor: parse-keypress
// recognises them but the `key` object exposed to user code has no
// `home` / `end` field, and the matching `input` string is replaced
// with an empty string before delivery. To get them back we listen
// directly on the internal event emitter and pattern-match the raw
// escape sequence ourselves.
//
// Patterns sourced from ink/build/parse-keypress.js (xterm / vt220 /
// rxvt variants). Cmd+Arrow on macOS Terminal / iTerm2 typically
// fires meta+leftArrow/rightArrow which is already handled by
// handleTextInputKey, so we don't need to cover it here.
const HOME_PATTERNS = ['\x1b[H', '\x1bOH', '\x1b[1~', '\x1b[7~'];
const END_PATTERNS = ['\x1b[F', '\x1bOF', '\x1b[4~', '\x1b[8~'];

const matches = (data: string, patterns: string[]): boolean =>
  patterns.some((p) => data === p);

export interface ExtraKeyHandlers {
  onHome?: () => void;
  onEnd?: () => void;
}

// `active` mirrors ink's `useInput` activation: when false the listener
// is detached so it doesn't fire while another picker step owns input.
export function useExtraKeys(
  active: boolean,
  handlers: ExtraKeyHandlers,
): void {
  const { internal_eventEmitter } = useStdin();
  const { onHome, onEnd } = handlers;

  useEffect(() => {
    if (!active || !internal_eventEmitter) return;
    const listener = (data: Buffer | string) => {
      const s = typeof data === 'string' ? data : data.toString();
      if (onHome && matches(s, HOME_PATTERNS)) onHome();
      else if (onEnd && matches(s, END_PATTERNS)) onEnd();
    };
    internal_eventEmitter.on('input', listener);
    return () => {
      internal_eventEmitter.off('input', listener);
    };
  }, [active, internal_eventEmitter, onHome, onEnd]);
}
