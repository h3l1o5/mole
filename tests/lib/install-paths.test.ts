import { test, expect, describe } from 'bun:test';
import { homedir } from 'os';
import { PATHS, plistPath, pathsToRemove } from '../../src/lib/install-paths';

describe('install-paths', () => {
  const HOME = homedir();

  test('binDir under $HOME/.local/bin', () => {
    expect(PATHS.binDir).toBe(`${HOME}/.local/bin`);
  });

  test('logDir under $HOME/.local/state/mole', () => {
    expect(PATHS.logDir).toBe(`${HOME}/.local/state/mole`);
  });

  test('laDir under $HOME/Library/LaunchAgents', () => {
    expect(PATHS.laDir).toBe(`${HOME}/Library/LaunchAgents`);
  });

  test('daemon label is com.h3l1o5.mole-daemon', () => {
    expect(PATHS.daemonLabel).toBe('com.h3l1o5.mole-daemon');
  });

  test('socket at /tmp/mole-clip.sock', () => {
    expect(PATHS.socket).toBe('/tmp/mole-clip.sock');
  });

  test('plistPath joins laDir + label.plist', () => {
    expect(plistPath()).toBe(
      `${HOME}/Library/LaunchAgents/com.h3l1o5.mole-daemon.plist`,
    );
  });

  test('pathsToRemove returns 3 binaries + plist + logDir + socket', () => {
    const paths = pathsToRemove();
    expect(paths).toHaveLength(6);
    expect(paths).toContain(`${HOME}/.local/bin/mole`);
    expect(paths).toContain(`${HOME}/.local/bin/mole-daemon`);
    expect(paths).toContain(`${HOME}/.local/bin/mole-pasteboard`);
    expect(paths).toContain(plistPath());
    expect(paths).toContain(PATHS.logDir);
    expect(paths).toContain(PATHS.socket);
  });
});
