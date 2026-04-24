import { test, expect, describe } from 'bun:test';
import {
  parseLockTarget,
  isPidAlive,
  checkProfileStatus,
  scanProfiles,
} from '../../src/lib/chrome-profile';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('parseLockTarget', () => {
  test('extracts pid from hostname-pid format', () => {
    expect(parseLockTarget('MyMac.local-12345')).toBe(12345);
  });

  test('returns null for malformed target', () => {
    expect(parseLockTarget('no-pid-here')).toBe(null);
    expect(parseLockTarget('')).toBe(null);
  });

  test('extracts pid when hostname has hyphens', () => {
    expect(parseLockTarget('Mac-Work-Laptop-9876')).toBe(9876);
  });
});

describe('isPidAlive', () => {
  test('returns true for current process', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  test('returns false for likely-dead pid', () => {
    expect(isPidAlive(999_999_999)).toBe(false);
  });
});

describe('checkProfileStatus', () => {
  const makeTempProfile = () => mkdtempSync(join(tmpdir(), 'mole-profile-'));

  test('no SingletonLock → free', async () => {
    const dir = makeTempProfile();
    try {
      const r = await checkProfileStatus(dir, async () => null);
      expect(r.status).toBe('free');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('lock pointing at dead pid → stale', async () => {
    const dir = makeTempProfile();
    try {
      symlinkSync('deadhost-999999999', join(dir, 'SingletonLock'));
      const r = await checkProfileStatus(dir, async () => null);
      expect(r.status).toBe('stale');
      expect(r.pid).toBe(999999999);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('lock pointing at live pid without debug port → busy', async () => {
    const dir = makeTempProfile();
    try {
      symlinkSync(`host-${process.pid}`, join(dir, 'SingletonLock'));
      const r = await checkProfileStatus(dir, async () => 'bun /some/thing');
      expect(r.status).toBe('busy');
      expect(r.pid).toBe(process.pid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('lock pointing at live pid with debug port → reusable', async () => {
    const dir = makeTempProfile();
    try {
      symlinkSync(`host-${process.pid}`, join(dir, 'SingletonLock'));
      const r = await checkProfileStatus(
        dir,
        async () =>
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222 --user-data-dir=/foo',
      );
      expect(r.status).toBe('reusable');
      expect(r.pid).toBe(process.pid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scanProfiles', () => {
  test('returns empty when base dir does not exist', async () => {
    const r = await scanProfiles('/nonexistent/path/that/never/exists');
    expect(r).toEqual([]);
  });

  test('returns profile list with statuses', async () => {
    const base = mkdtempSync(join(tmpdir(), 'mole-base-'));
    try {
      mkdirSync(join(base, 'work'));
      mkdirSync(join(base, 'personal'));
      const r = await scanProfiles(base, async () => null);
      const names = r.map((p) => p.name).sort();
      expect(names).toEqual(['personal', 'work']);
      expect(r.every((p) => p.status === 'free')).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
