import { test, expect, describe } from 'bun:test';
import { readClipboardWith } from '../../src/lib/clipboard';

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
