import { test, expect, describe } from 'bun:test';
import { buildSshArgs } from '../../src/lib/ssh-session';

describe('buildSshArgs', () => {
  test('uses defaults', () => {
    expect(buildSshArgs({ host: 'prod' })).toEqual([
      '-o', 'StreamLocalBindUnlink=yes',
      '-o', 'ExitOnForwardFailure=no',
      '-R', '/tmp/mole-clip.sock:/tmp/mole-clip.sock',
      '-R', '/tmp/mole-chrome.sock:127.0.0.1:9222',
      'prod',
    ]);
  });

  test('respects custom socket paths and port', () => {
    expect(
      buildSshArgs({
        host: 'dev',
        clipSocket: '/tmp/a.sock',
        chromeSocket: '/tmp/b.sock',
        chromePort: 9333,
      }),
    ).toEqual([
      '-o', 'StreamLocalBindUnlink=yes',
      '-o', 'ExitOnForwardFailure=no',
      '-R', '/tmp/a.sock:/tmp/a.sock',
      '-R', '/tmp/b.sock:127.0.0.1:9333',
      'dev',
    ]);
  });
});
