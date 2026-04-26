// Subset of ink's Key shape we actually use. Re-declared so this module
// stays pure and easy to unit test without a render harness.
export interface KeyEvent {
  leftArrow?: boolean;
  rightArrow?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  return?: boolean;
  backspace?: boolean;
  delete?: boolean;
  escape?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

export interface TextInputState {
  value: string;
  cursor: number;
}

// Ink's Key shape has no `home`/`end`. Mac users typically use Cmd+Arrow
// for line-start/-end; readline-style Ctrl+A / Ctrl+E also works.
const isHome = (input: string, key: KeyEvent): boolean =>
  (key.ctrl && input === 'a') || (key.meta === true && key.leftArrow === true);

const isEnd = (input: string, key: KeyEvent): boolean =>
  (key.ctrl && input === 'e') || (key.meta === true && key.rightArrow === true);

// Returns the new state, or null when the key isn't owned by the input
// (so the caller can fall through to list-mode handling). The contract:
// any horizontal motion or text mutation lives here; vertical motion,
// Enter, and Escape are NOT consumed.
export function handleTextInputKey(
  state: TextInputState,
  input: string,
  key: KeyEvent,
): TextInputState | null {
  const { value, cursor } = state;

  if (isHome(input, key)) return { value, cursor: 0 };
  if (isEnd(input, key)) return { value, cursor: value.length };

  if (key.leftArrow) {
    return cursor > 0 ? { value, cursor: cursor - 1 } : null;
  }
  if (key.rightArrow) {
    return cursor < value.length ? { value, cursor: cursor + 1 } : null;
  }

  // Mac's main Delete key (the one that erases left) shows up as
  // either key.backspace or key.delete depending on ink version /
  // terminal. Treat both as delete-left so behaviour matches user
  // expectation. Forward-delete (Fn+Delete on macOS) is rare in CLI
  // input and currently unsupported.
  if (key.backspace || key.delete) {
    if (cursor === 0) return null;
    return {
      value: value.slice(0, cursor - 1) + value.slice(cursor),
      cursor: cursor - 1,
    };
  }

  // Pass through control / nav keys we don't own.
  if (key.upArrow || key.downArrow || key.return || key.escape) return null;
  if (key.ctrl || key.meta) return null;

  // Printable insertion (single char from useInput).
  if (input && input.length > 0) {
    return {
      value: value.slice(0, cursor) + input + value.slice(cursor),
      cursor: cursor + input.length,
    };
  }

  return null;
}
