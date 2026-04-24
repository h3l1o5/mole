import { test, expect, describe } from 'bun:test';
import { buildCleanupScript, runCleanupWith } from '../../src/lib/remote-cleanup';

describe('buildCleanupScript', () => {
  test('kills only the given pid if it still matches socat pattern', () => {
    const s = buildCleanupScript(12345);
    expect(s).toContain('12345');
    expect(s).toContain('socat.*mole-chrome');
  });
});

describe('runCleanupWith', () => {
  test('resolves ok on code 0', async () => {
    const r = await runCleanupWith('host', 42, async () => ({
      stdout: '',
      stderr: '',
      code: 0,
    }));
    expect(r.ok).toBe(true);
  });

  test('captures stderr on non-zero', async () => {
    const r = await runCleanupWith('host', 42, async () => ({
      stdout: '',
      stderr: 'No such process\n',
      code: 1,
    }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('No such process');
  });
});
