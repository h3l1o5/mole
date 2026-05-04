import { test, expect, describe } from 'bun:test';
import {
  SHIM_CONTENT,
  SHIM_HASH,
  HEREDOC_TERMINATOR,
} from '../../src/lib/remote-shim';

describe('remote-shim embed', () => {
  test('SHIM_CONTENT is non-empty bash script', () => {
    expect(SHIM_CONTENT.length).toBeGreaterThan(100);
    expect(SHIM_CONTENT.startsWith('#!')).toBe(true);
  });

  test('SHIM_HASH is 12 lowercase hex chars', () => {
    expect(SHIM_HASH).toMatch(/^[0-9a-f]{12}$/);
  });

  test('SHIM_CONTENT does not contain the heredoc terminator', () => {
    expect(SHIM_CONTENT).not.toContain(HEREDOC_TERMINATOR);
  });

  test('SHIM_HASH equals first 12 chars of sha256(SHIM_CONTENT)', () => {
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(SHIM_CONTENT);
    const expected = hasher.digest('hex').slice(0, 12);
    expect(SHIM_HASH).toBe(expected);
  });
});
