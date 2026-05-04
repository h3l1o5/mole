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

  test('emits MOLE_SOCAT_MISSING with distro detected from /etc/os-release', () => {
    const script = buildPreflightScript();
    expect(script).toContain('MOLE_SOCAT_MISSING:');
    expect(script).toContain('/etc/os-release');
    expect(script).toContain('debian');
    expect(script).toContain('rhel');
    expect(script).toContain('arch');
  });

  test('emits MOLE_SHIM_HASH with first 12 chars of sha256 when shim present', () => {
    const script = buildPreflightScript();
    expect(script).toContain('MOLE_SHIM_HASH:');
    expect(script).toContain('sha256sum');
    expect(script).toContain('cut -c1-12');
  });

  test('emits MOLE_SHIM_MISSING when shim absent', () => {
    const script = buildPreflightScript();
    expect(script).toContain('MOLE_SHIM_MISSING:');
  });
});

describe('runPreflightWith', () => {
  const HASH = 'aaaabbbbcccc';

  test('returns ok with empty warnings on success', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: `MOLE_SHIM_HASH: ${HASH}\n`,
        code: 0,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({ kind: 'ok', warnings: [] });
  });

  test('extracts MOLE_WARN: lines into ok outcome warnings', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: `MOLE_WARN: cannot read sshd config\nMOLE_SHIM_HASH: ${HASH}\n`,
        code: 0,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({
      kind: 'ok',
      warnings: ['cannot read sshd config'],
    });
  });

  test('classifies socat-missing with debian distro', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: 'MOLE_SOCAT_MISSING: debian\n',
        code: 1,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({ kind: 'socat-missing', distro: 'debian' });
  });

  test('classifies socat-missing with unknown distro fallback', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: 'MOLE_SOCAT_MISSING: weirdos\n',
        code: 1,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({ kind: 'socat-missing', distro: 'unknown' });
  });

  test('classifies shim-missing', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: 'MOLE_SHIM_MISSING:\n',
        code: 2,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({ kind: 'shim-missing' });
  });

  test('classifies shim-outdated when remote hash differs from expected', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: 'MOLE_SHIM_HASH: deadbeefdead\n',
        code: 0,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({
      kind: 'shim-outdated',
      remoteHash: 'deadbeefdead',
    });
  });

  test('classifies sshd-config-missing on exit 3', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr:
          "ERROR: remote sshd missing 'StreamLocalBindUnlink yes'; ...\n",
        code: 3,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({ kind: 'sshd-config-missing' });
  });

  test('falls back to error kind with all stderr lines on unknown failure', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: 'something exploded\nmore detail\n',
        code: 99,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({
      kind: 'error',
      errors: ['something exploded', 'more detail'],
    });
  });
});
