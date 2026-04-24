export type ClipboardResult =
  | { type: 'image'; format: 'png'; data: Uint8Array }
  | { type: 'empty' };

export type ClipboardRunner = () => Promise<{
  data: Uint8Array;
  code: number;
}>;

export async function readClipboardWith(
  run: ClipboardRunner,
): Promise<ClipboardResult> {
  const { data, code } = await run();
  if (code !== 0 || data.byteLength === 0) {
    return { type: 'empty' };
  }
  return { type: 'image', format: 'png', data };
}

export function createCachedReader(
  reader: () => Promise<ClipboardResult>,
  ttlMs: number,
  now: () => number = Date.now,
): () => Promise<ClipboardResult> {
  let cached: ClipboardResult | null = null;
  let cachedAt = 0;
  let inFlight: Promise<ClipboardResult> | null = null;

  return async () => {
    const t = now();
    if (cached !== null && t - cachedAt < ttlMs) return cached;
    if (inFlight !== null) return inFlight;
    inFlight = (async () => {
      try {
        const result = await reader();
        cached = result;
        cachedAt = now();
        return result;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}

export async function readClipboard(): Promise<ClipboardResult> {
  return readClipboardWith(async () => {
    const proc = Bun.spawn(['pngpaste', '-'], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const [buffer, code] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      proc.exited,
    ]);
    return { data: new Uint8Array(buffer), code };
  });
}
