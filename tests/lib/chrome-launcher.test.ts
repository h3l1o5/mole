import { test, expect, describe } from 'bun:test';
import { buildChromeArgs } from '../../src/lib/chrome-launcher';

describe('buildChromeArgs', () => {
  test('produces open args with user-data-dir and remote debugging', () => {
    expect(
      buildChromeArgs({ profilePath: '/Users/x/.chrome-profiles/work' }),
    ).toEqual([
      '-na',
      'Google Chrome',
      '--args',
      '--user-data-dir=/Users/x/.chrome-profiles/work',
      '--remote-debugging-port=9222',
      '--remote-allow-origins=*',
    ]);
  });

  test('respects custom port', () => {
    const args = buildChromeArgs({
      profilePath: '/tmp/p',
      port: 9300,
    });
    expect(args).toContain('--remote-debugging-port=9300');
  });
});
