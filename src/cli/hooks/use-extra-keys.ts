import { useEffect } from 'react';
import { useStdin } from 'ink';

// Ink's `useInput` drops Home / End. Listen on the internal event
// emitter and pattern-match raw escape sequences to get them back.
// Patterns cover xterm / vt220 / rxvt variants.
const HOME_PATTERNS = ['\x1b[H', '\x1bOH', '\x1b[1~', '\x1b[7~'];
const END_PATTERNS = ['\x1b[F', '\x1bOF', '\x1b[4~', '\x1b[8~'];

const matches = (data: string, patterns: string[]): boolean =>
  patterns.some((p) => data === p);

export interface ExtraKeyHandlers {
  onHome?: () => void;
  onEnd?: () => void;
}

// `active`: detach listener when another picker step owns input.
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
