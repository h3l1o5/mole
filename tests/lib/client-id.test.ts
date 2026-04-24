import { test, expect, describe } from 'bun:test';
import { getOrCreateClientId } from '../../src/lib/client-id';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('getOrCreateClientId', () => {
  test('mints and persists a uuid when file is absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-cid-'));
    try {
      const path = join(dir, 'client-id');
      const id = getOrCreateClientId(path);
      expect(id).toMatch(UUID_RE);
      expect(readFileSync(path, 'utf8').trim()).toBe(id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns the same id on subsequent reads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-cid-'));
    try {
      const path = join(dir, 'client-id');
      const id1 = getOrCreateClientId(path);
      const id2 = getOrCreateClientId(path);
      expect(id2).toBe(id1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('creates parent directory if missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-cid-'));
    try {
      const path = join(dir, 'nested', 'deeper', 'client-id');
      const id = getOrCreateClientId(path);
      expect(id).toMatch(UUID_RE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reads an existing non-empty file verbatim', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-cid-'));
    try {
      const path = join(dir, 'client-id');
      writeFileSync(path, 'preexisting-value\n');
      const id = getOrCreateClientId(path);
      expect(id).toBe('preexisting-value');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('regenerates when existing file is empty/whitespace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-cid-'));
    try {
      const path = join(dir, 'client-id');
      writeFileSync(path, '   \n');
      const id = getOrCreateClientId(path);
      expect(id).toMatch(UUID_RE);
      expect(readFileSync(path, 'utf8').trim()).toBe(id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
