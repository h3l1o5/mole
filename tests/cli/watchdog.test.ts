import { test, expect, describe } from 'bun:test';
import { checkOnce } from '../../src/cli/watchdog';

describe('checkOnce', () => {
  test('ok when remote returns the same id', async () => {
    const result = await checkOnce({
      host: 'vbm',
      ourId: 'my-id',
      runner: async () => ({ stdout: '{"id":"my-id"}', code: 0 }),
    });
    expect(result).toBe('ok');
  });

  test('mismatch when remote returns a different id', async () => {
    const result = await checkOnce({
      host: 'vbm',
      ourId: 'my-id',
      runner: async () => ({ stdout: '{"id":"other-id"}', code: 0 }),
    });
    expect(result).toBe('mismatch');
  });

  test('mismatch when remote returns empty id (another daemon)', async () => {
    const result = await checkOnce({
      host: 'vbm',
      ourId: 'my-id',
      runner: async () => ({ stdout: '{"id":""}', code: 0 }),
    });
    expect(result).toBe('mismatch');
  });

  test('unreachable when runner exits non-zero', async () => {
    const result = await checkOnce({
      host: 'vbm',
      ourId: 'my-id',
      runner: async () => ({ stdout: '', code: 1 }),
    });
    expect(result).toBe('unreachable');
  });

  test('unreachable when runner throws', async () => {
    const result = await checkOnce({
      host: 'vbm',
      ourId: 'my-id',
      runner: async () => {
        throw new Error('network down');
      },
    });
    expect(result).toBe('unreachable');
  });

  test('unreachable when stdout is not parseable json', async () => {
    const result = await checkOnce({
      host: 'vbm',
      ourId: 'my-id',
      runner: async () => ({ stdout: 'not json', code: 0 }),
    });
    expect(result).toBe('unreachable');
  });
});
