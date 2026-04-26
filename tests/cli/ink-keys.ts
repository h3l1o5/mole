// Shared keystroke helpers for ink-testing-library component tests.
// Held in one place so the "useInput attaches its listener in a
// useEffect" invariant is documented once.

export const KEY = {
  enter: '\r',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  esc: '\x1b',
};

// Yields one macrotask so ink's useEffect (where useInput attaches its
// stdin listener) gets to run before the next stdin write. setImmediate
// is enough — no real time needs to pass.
export const flush = (): Promise<void> =>
  new Promise((r) => setImmediate(r));

export async function press(
  stdin: { write: (s: string) => void },
  data: string,
): Promise<void> {
  await flush();
  stdin.write(data);
  await flush();
}
