import { test, expect, describe } from 'bun:test';
import { buildWillLines } from '../../../src/cli/wizard/will';
import type { SshHost } from '../../../src/lib/ssh-config';
import type { ProfileInfo } from '../../../src/lib/chrome-profile';

const HOST: SshHost = { name: 'vbm' };
const PROFILE: ProfileInfo = { name: 'agent', path: '/p/agent', status: 'free' };

describe('buildWillLines', () => {
  test('with chrome: 3 lines, chrome first', () => {
    const lines = buildWillLines({ host: HOST, profile: PROFILE });
    expect(lines).toEqual([
      'launch Chrome with profile agent',
      'open SSH session to vbm',
      'forward Mac clipboard via /tmp/mole-clip.sock',
    ]);
  });

  test('skip chrome: 2 lines, no chrome', () => {
    const lines = buildWillLines({ host: HOST, profile: 'skip' });
    expect(lines).toEqual([
      'open SSH session to vbm',
      'forward Mac clipboard via /tmp/mole-clip.sock',
    ]);
  });

  test('uses host.name not host.hostname', () => {
    const lines = buildWillLines({
      host: { name: 'vbm', user: 'root', hostname: 'martyvbm.syno' },
      profile: 'skip',
    });
    expect(lines[0]).toBe('open SSH session to vbm');
  });
});
