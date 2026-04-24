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

const PNG_DATA_PREFIX = '«data PNGf';
const PNG_DATA_SUFFIX = '»';

export function extractPngHex(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(PNG_DATA_PREFIX) || !trimmed.endsWith(PNG_DATA_SUFFIX)) {
    return null;
  }
  return trimmed.slice(PNG_DATA_PREFIX.length, -PNG_DATA_SUFFIX.length);
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length === 0 || hex.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const READ_CLIPBOARD_PNG_SCRIPT = `
try
  return (the clipboard as «class PNGf»)
on error
  return ""
end try
`;

export async function readClipboard(): Promise<ClipboardResult> {
  return readClipboardWith(async () => {
    const proc = Bun.spawn(['osascript', '-e', READ_CLIPBOARD_PNG_SCRIPT], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const [stdout, code] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    if (code !== 0) return { data: new Uint8Array(), code };
    const hex = extractPngHex(stdout);
    if (hex === null) return { data: new Uint8Array(), code: 0 };
    return { data: hexToBytes(hex), code: 0 };
  });
}
