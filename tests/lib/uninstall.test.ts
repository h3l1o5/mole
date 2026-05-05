import { test, expect, describe } from 'bun:test';
import {
  performUninstall,
  type UninstallDeps,
  type UninstallReport,
} from '../../src/lib/uninstall';

const okBootout: UninstallDeps['bootout'] = async () => ({ code: 0, stderr: '' });
const failBootout: UninstallDeps['bootout'] = async () => ({
  code: 113,
  stderr: 'Could not find specified service',
});

const noopSleep: UninstallDeps['sleep'] = async () => {};

function makeDeps(overrides: Partial<UninstallDeps> = {}): UninstallDeps {
  return {
    bootout: okBootout,
    socketGone: async () => true,
    killDaemon: async () => {},
    remove: async () => ({ ok: true }),
    sleep: noopSleep,
    listActiveSessions: async () => [],
    ...overrides,
  };
}

describe('performUninstall', () => {
  test('happy path: bootout ok, socket gone, all paths removed', async () => {
    const removed: string[] = [];
    const report = await performUninstall(
      makeDeps({
        remove: async (p) => {
          removed.push(p);
          return { ok: true };
        },
      }),
      ['/a', '/b', '/c'],
    );
    expect(report.daemonStopped).toBe(true);
    expect(report.daemonKilled).toBe(false);
    expect(report.removed).toEqual(['/a', '/b', '/c']);
    expect(report.failed).toEqual([]);
    expect(removed).toEqual(['/a', '/b', '/c']);
  });

  test('bootout fails (already unloaded) is OK', async () => {
    const report = await performUninstall(
      makeDeps({ bootout: failBootout }),
      ['/a'],
    );
    expect(report.daemonStopped).toBe(true);
    expect(report.daemonKilled).toBe(false);
  });

  test('socket persists after bootout → killDaemon called', async () => {
    let killed = false;
    const report = await performUninstall(
      makeDeps({
        socketGone: async () => false,
        killDaemon: async () => {
          killed = true;
        },
      }),
      ['/a'],
    );
    expect(killed).toBe(true);
    expect(report.daemonKilled).toBe(true);
  });

  test('remove failure is collected, does not abort other removals', async () => {
    const report = await performUninstall(
      makeDeps({
        remove: async (p) => {
          if (p === '/b') return { ok: false, error: 'EACCES' };
          return { ok: true };
        },
      }),
      ['/a', '/b', '/c'],
    );
    expect(report.removed).toEqual(['/a', '/c']);
    expect(report.failed).toEqual([{ path: '/b', error: 'EACCES' }]);
  });

  test('reports active mole CLI sessions sampled before bootout', async () => {
    const order: string[] = [];
    const report = await performUninstall(
      makeDeps({
        listActiveSessions: async () => {
          order.push('list');
          return [1234, 5678];
        },
        bootout: async () => {
          order.push('bootout');
          return { code: 0, stderr: '' };
        },
      }),
      ['/a'],
    );
    expect(report.activeSessions).toEqual([1234, 5678]);
    expect(order).toEqual(['list', 'bootout']);
  });

  test('no active sessions → empty list, no daemonKilled false-positive', async () => {
    const report = await performUninstall(makeDeps(), ['/a']);
    expect(report.activeSessions).toEqual([]);
  });

  test('socket eventually goes after a few polls → no kill', async () => {
    let polls = 0;
    const report = await performUninstall(
      makeDeps({
        socketGone: async () => {
          polls += 1;
          return polls >= 3;
        },
      }),
      ['/a'],
    );
    expect(polls).toBe(3);
    expect(report.daemonKilled).toBe(false);
  });
});
