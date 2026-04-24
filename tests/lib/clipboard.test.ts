import { test, expect, describe } from 'bun:test';
import {
  readClipboardWith,
  extractPngHex,
  hexToBytes,
} from '../../src/lib/clipboard';

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
