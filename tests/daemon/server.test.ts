import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { createServer } from '../../src/daemon/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClipboardResult } from '../../src/lib/clipboard';

describe('daemon server', () => {
  let tempDir: string;
  let sockPath: string;
  let server: { stop: () => Promise<void> };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mole-sock-'));
    sockPath = join(tempDir, 'test.sock');
  });

  afterEach(async () => {
    if (server) await server.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('GET /type returns image when clipboard has image', async () => {
    server = await createServer(sockPath, async (): Promise<ClipboardResult> => ({
      type: 'image',
      format: 'png',
      data: new Uint8Array([1, 2, 3]),
    }));
    const r = await fetch('http://x/type', { unix: sockPath });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ type: 'image', format: 'png' });
  });

  test('GET /type returns empty when no image', async () => {
    server = await createServer(sockPath, async () => ({ type: 'empty' }));
    const r = await fetch('http://x/type', { unix: sockPath });
    expect(await r.json()).toEqual({ type: 'empty' });
  });

  test('GET /image returns bytes with image/png content type', async () => {
    server = await createServer(sockPath, async () => ({
      type: 'image',
      format: 'png',
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    }));
    const r = await fetch('http://x/image', { unix: sockPath });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    const buf = new Uint8Array(await r.arrayBuffer());
    expect(buf.byteLength).toBe(8);
    expect(buf[0]).toBe(0x89);
  });

  test('GET /image returns 404 when clipboard empty', async () => {
    server = await createServer(sockPath, async () => ({ type: 'empty' }));
    const r = await fetch('http://x/image', { unix: sockPath });
    expect(r.status).toBe(404);
  });

  test('unknown path returns 404', async () => {
    server = await createServer(sockPath, async () => ({ type: 'empty' }));
    const r = await fetch('http://x/whatever', { unix: sockPath });
    expect(r.status).toBe(404);
  });

  test('re-creating server on same socket path succeeds (unlinks stale)', async () => {
    server = await createServer(sockPath, async () => ({ type: 'empty' }));
    await server.stop();
    server = await createServer(sockPath, async () => ({ type: 'empty' }));
    const r = await fetch('http://x/type', { unix: sockPath });
    expect(r.status).toBe(200);
  });

  test('GET /id returns the configured client id', async () => {
    server = await createServer(
      sockPath,
      async () => ({ type: 'empty' }),
      { clientId: 'abc-123' },
    );
    const r = await fetch('http://x/id', { unix: sockPath });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: 'abc-123' });
  });
});
