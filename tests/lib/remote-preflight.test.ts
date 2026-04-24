import { test, expect, describe } from 'bun:test';
import {
  buildPreflightScript,
  runPreflightWith,
} from '../../src/lib/remote-preflight';

describe('buildPreflightScript', () => {
  test('checks socat, shim, starts socat, prints pid', () => {
    const script = buildPreflightScript({
      chromeSocket: '/tmp/mole-chrome.sock',
      chromePort: 9222,
    });
    expect(script).toContain('command -v socat');
    expect(script).toContain('$HOME/.local/bin/xclip');
    expect(script).toContain('pgrep -f');
    expect(script).toContain('socat TCP-LISTEN:9222');
    expect(script).toContain('UNIX-CONNECT:/tmp/mole-chrome.sock');
  });
});

describe('runPreflightWith', () => {
  test('returns ok with socat pid on success', async () => {
    const r = await runPreflightWith('host', async () => ({
      stdout: '12345\n',
      stderr: '',
      code: 0,
    }));
    expect(r.ok).toBe(true);
    expect(r.socatPid).toBe(12345);
  });

  test('returns not ok with errors on non-zero exit', async () => {
    const r = await runPreflightWith('host', async () => ({
      stdout: '',
      stderr: 'ERROR: socat not installed on remote\n',
      code: 1,
    }));
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(['ERROR: socat not installed on remote']);
  });
});
