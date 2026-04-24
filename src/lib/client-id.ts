import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function getOrCreateClientId(path: string): string {
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8').trim();
    if (existing.length > 0) return existing;
  }
  mkdirSync(dirname(path), { recursive: true });
  const id = randomUUID();
  writeFileSync(path, id + '\n');
  return id;
}
