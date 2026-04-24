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

  test('verifies StreamLocalBindUnlink yes before starting socat', () => {
    const script = buildPreflightScript();
    expect(script).toContain('StreamLocalBindUnlink');
    expect(script).toContain('/etc/ssh/sshd_config');
    const slbuIdx = script.indexOf('StreamLocalBindUnlink');
    const socatLaunchIdx = script.indexOf('nohup socat');
    expect(slbuIdx).toBeGreaterThan(-1);
    expect(socatLaunchIdx).toBeGreaterThan(-1);
    expect(slbuIdx).toBeLessThan(socatLaunchIdx);
  });

  test('uses MOLE_WARN: prefix so unreadable config only warns, never fails', () => {
    const script = buildPreflightScript();
    expect(script).toContain('MOLE_WARN:');
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

  test('extracts MOLE_WARN: stderr lines into warnings on success', async () => {
    const r = await runPreflightWith('host', async () => ({
      stdout: '12345\n',
      stderr: 'MOLE_WARN: cannot read sshd config\n',
      code: 0,
    }));
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual(['cannot read sshd config']);
    expect(r.errors).toEqual([]);
  });

  test('captures multiple MOLE_WARN: lines', async () => {
    const r = await runPreflightWith('host', async () => ({
      stdout: '1\n',
      stderr: 'MOLE_WARN: first warning\nMOLE_WARN: second warning\n',
      code: 0,
    }));
    expect(r.warnings).toEqual(['first warning', 'second warning']);
  });

  test('separates warnings from errors when preflight fails', async () => {
    const r = await runPreflightWith('host', async () => ({
      stdout: '',
      stderr:
        'MOLE_WARN: partial config readable\nERROR: sshd missing StreamLocalBindUnlink yes\n',
      code: 3,
    }));
    expect(r.ok).toBe(false);
    expect(r.warnings).toEqual(['partial config readable']);
    expect(r.errors).toEqual(['ERROR: sshd missing StreamLocalBindUnlink yes']);
  });
});
