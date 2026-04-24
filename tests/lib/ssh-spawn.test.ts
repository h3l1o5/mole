import { test, expect, describe } from 'bun:test';
import { buildNonInteractiveSshArgs } from '../../src/lib/ssh-spawn';

describe('buildNonInteractiveSshArgs', () => {
  test('uses BatchMode=yes so interactive prompts fail fast', () => {
    const args = buildNonInteractiveSshArgs('myhost', ['bash', '-s']);
    expect(args).toContain('BatchMode=yes');
  });

  test('uses StrictHostKeyChecking=accept-new so first-run auto-trusts host', () => {
    const args = buildNonInteractiveSshArgs('myhost', ['bash', '-s']);
    expect(args).toContain('StrictHostKeyChecking=accept-new');
  });

  test('host comes before the remote command', () => {
    const args = buildNonInteractiveSshArgs('myhost', ['bash', '-s']);
    const hostIdx = args.indexOf('myhost');
    const bashIdx = args.indexOf('bash');
    expect(hostIdx).toBeGreaterThan(-1);
    expect(bashIdx).toBeGreaterThan(hostIdx);
  });

  test('trailing command is preserved in order', () => {
    const args = buildNonInteractiveSshArgs('h', ['echo', 'hello world']);
    expect(args.slice(-2)).toEqual(['echo', 'hello world']);
  });
});
