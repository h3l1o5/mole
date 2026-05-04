import { test, expect, describe } from 'bun:test';
import { realSshRunner, type SshRunner } from '../../src/lib/ssh-exec';

describe('ssh-exec', () => {
  test('realSshRunner is exported as a function', () => {
    expect(typeof realSshRunner).toBe('function');
  });

  test('SshRunner type accepts (host, script) and returns stdout/stderr/code', async () => {
    const fake: SshRunner = async (host, script) => ({
      stdout: `${host}:${script.length}`,
      stderr: '',
      code: 0,
    });
    const r = await fake('h', 'echo');
    expect(r.stdout).toBe('h:4');
    expect(r.code).toBe(0);
  });
});
