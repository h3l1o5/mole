import { test, expect, describe } from 'bun:test';
import {
  readClipboardWith,
  createCachedReader,
} from '../../src/lib/clipboard';
import type { ClipboardResult } from '../../src/lib/clipboard';

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

  test('TTL boundary: re-reads exactly when elapsed === ttlMs (the < cutoff)', async () => {
    let calls = 0;
    let mockNow = 1000;
    const reader = async (): Promise<ClipboardResult> => {
      calls++;
      return empty;
    };
    const cached = createCachedReader(reader, 500, () => mockNow);
    await cached();
    expect(calls).toBe(1);
    // Cache lookup uses `t - cachedAt < ttlMs`. At exactly ttlMs the
    // cache must miss — it's the boundary, not a fence.
    mockNow += 500;
    await cached();
    expect(calls).toBe(2);
    // One tick before the boundary still hits.
    mockNow += 499;
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
