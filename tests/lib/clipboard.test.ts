import { test, expect, describe } from 'bun:test';
import {
  readClipboardWith,
  extractPngHex,
  hexToBytes,
  createCachedReader,
} from '../../src/lib/clipboard';
import type { ClipboardResult } from '../../src/lib/clipboard';

describe('extractPngHex', () => {
  test('strips «data PNGf» wrapper', () => {
    expect(extractPngHex('«data PNGf89504E47»')).toBe('89504E47');
  });

  test('tolerates trailing newline from osascript', () => {
    expect(extractPngHex('«data PNGf89504E47»\n')).toBe('89504E47');
  });

  test('returns null for empty string', () => {
    expect(extractPngHex('')).toBeNull();
  });

  test('returns null for non-PNG data literal', () => {
    expect(extractPngHex('«data rtf 7B5C727466»')).toBeNull();
  });

  test('returns null for plain text clipboard', () => {
    expect(extractPngHex('hello world')).toBeNull();
  });
});

describe('hexToBytes', () => {
  test('decodes even-length hex', () => {
    const bytes = hexToBytes('89504E47');
    expect(bytes).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  test('accepts lowercase hex', () => {
    expect(hexToBytes('89504e47')).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  test('returns empty for empty input', () => {
    expect(hexToBytes('')).toEqual(new Uint8Array());
  });

  test('returns empty for odd-length hex', () => {
    expect(hexToBytes('abc')).toEqual(new Uint8Array());
  });
});

describe('createCachedReader', () => {
  const empty: ClipboardResult = { type: 'empty' };

  test('first call invokes the underlying reader', async () => {
    let calls = 0;
    const reader = async (): Promise<ClipboardResult> => {
      calls++;
      return empty;
    };
    const cached = createCachedReader(reader, 500);
    await cached();
    expect(calls).toBe(1);
  });

  test('second call within TTL returns cached value without re-reading', async () => {
    let calls = 0;
    const reader = async (): Promise<ClipboardResult> => {
      calls++;
      return empty;
    };
    const cached = createCachedReader(reader, 500);
    await cached();
    await cached();
    expect(calls).toBe(1);
  });

  test('call after TTL expiry invokes the reader again', async () => {
    let calls = 0;
    let mockNow = 1000;
    const reader = async (): Promise<ClipboardResult> => {
      calls++;
      return empty;
    };
    const cached = createCachedReader(reader, 500, () => mockNow);
    await cached();
    mockNow += 600;
    await cached();
    expect(calls).toBe(2);
  });

  test('concurrent calls share a single in-flight invocation', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const reader = async (): Promise<ClipboardResult> => {
      calls++;
      await gate;
      return empty;
    };
    const cached = createCachedReader(reader, 500);
    const p1 = cached();
    const p2 = cached();
    release();
    await Promise.all([p1, p2]);
    expect(calls).toBe(1);
  });
});

describe('readClipboardWith', () => {
  test('returns image when spawn yields bytes and exit code 0', async () => {
    const r = await readClipboardWith(async () => ({
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      code: 0,
    }));
    expect(r.type).toBe('image');
    if (r.type === 'image') {
      expect(r.format).toBe('png');
      expect(r.data.byteLength).toBe(4);
    }
  });

  test('returns empty when spawn exits non-zero', async () => {
    const r = await readClipboardWith(async () => ({
      data: new Uint8Array(),
      code: 1,
    }));
    expect(r.type).toBe('empty');
  });

  test('returns empty when stdout is zero bytes', async () => {
    const r = await readClipboardWith(async () => ({
      data: new Uint8Array(),
      code: 0,
    }));
    expect(r.type).toBe('empty');
  });
});
