import { test, expect, describe } from 'bun:test';
import { isDaemonHealthyWith } from '../../src/lib/daemon-health';

describe('isDaemonHealthyWith', () => {
  test('returns true when fetch ok', async () => {
    const r = await isDaemonHealthyWith('/tmp/x.sock', async () =>
      new Response('{}', { status: 200 }),
    );
    expect(r).toBe(true);
  });

  test('returns false when fetch throws', async () => {
    const r = await isDaemonHealthyWith('/tmp/x.sock', async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(r).toBe(false);
  });

  test('returns false on non-200 status', async () => {
    const r = await isDaemonHealthyWith('/tmp/x.sock', async () =>
      new Response('boom', { status: 500 }),
    );
    expect(r).toBe(false);
  });
});
