import { test, expect, describe } from 'bun:test';
import { fetchOurIdWith } from '../../src/lib/daemon-id';

describe('fetchOurIdWith', () => {
  test('returns id string on 200 + valid JSON', async () => {
    const r = await fetchOurIdWith('/tmp/x.sock', async () =>
      new Response(JSON.stringify({ id: 'abc-123' }), { status: 200 }),
    );
    expect(r).toBe('abc-123');
  });

  test('returns null when fetch throws (daemon down)', async () => {
    const r = await fetchOurIdWith('/tmp/x.sock', async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(r).toBeNull();
  });

  test('returns null on non-OK status', async () => {
    const r = await fetchOurIdWith('/tmp/x.sock', async () =>
      new Response('boom', { status: 500 }),
    );
    expect(r).toBeNull();
  });

  test('returns null when body is not parseable JSON', async () => {
    const r = await fetchOurIdWith('/tmp/x.sock', async () =>
      new Response('not json', { status: 200 }),
    );
    expect(r).toBeNull();
  });

  test('returns null when JSON has no id field', async () => {
    const r = await fetchOurIdWith('/tmp/x.sock', async () =>
      new Response(JSON.stringify({ other: 'value' }), { status: 200 }),
    );
    expect(r).toBeNull();
  });

  test('returns null when id is the empty string (server has no client id)', async () => {
    const r = await fetchOurIdWith('/tmp/x.sock', async () =>
      new Response(JSON.stringify({ id: '' }), { status: 200 }),
    );
    expect(r).toBeNull();
  });

  test('returns null when id is not a string', async () => {
    const r = await fetchOurIdWith('/tmp/x.sock', async () =>
      new Response(JSON.stringify({ id: 12345 }), { status: 200 }),
    );
    expect(r).toBeNull();
  });

  test('passes the socket path through to the fetcher as unix init option', async () => {
    let seenInit: (RequestInit & { unix?: string }) | undefined;
    await fetchOurIdWith('/tmp/probe.sock', async (_url, init) => {
      seenInit = init;
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    });
    expect(seenInit?.unix).toBe('/tmp/probe.sock');
  });
});
