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

export async function readClipboard(): Promise<ClipboardResult> {
  return readClipboardWith(async () => {
    const proc = Bun.spawn(['pngpaste', '-'], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const chunks: Uint8Array[] = [];
    for await (const chunk of proc.stdout) {
      chunks.push(chunk);
    }
    const code = await proc.exited;
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const data = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      data.set(c, offset);
      offset += c.byteLength;
    }
    return { data, code };
  });
}
