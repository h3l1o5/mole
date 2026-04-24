import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SshHost {
  name: string;
  hostname?: string;
}

export function parseSshConfig(content: string): SshHost[] {
  const hosts: SshHost[] = [];
  let current: SshHost | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const hostMatch = line.match(/^Host\s+(.+)$/i);
    if (hostMatch) {
      if (current) hosts.push(current);
      const firstName = hostMatch[1]!.split(/\s+/)[0];
      if (!firstName || firstName.includes('*') || firstName.includes('?')) {
        current = null;
      } else {
        current = { name: firstName };
      }
      continue;
    }

    if (!current) continue;

    const kv = line.match(/^(\S+)\s+(.+)$/);
    if (!kv) continue;
    const key = kv[1]!;
    const value = kv[2]!;
    if (key.toLowerCase() === 'hostname') {
      current.hostname = value.trim();
    }
  }

  if (current) hosts.push(current);
  return hosts;
}

export function loadSshHosts(
  configPath: string = join(homedir(), '.ssh', 'config'),
): SshHost[] {
  if (!existsSync(configPath)) return [];
  return parseSshConfig(readFileSync(configPath, 'utf8'));
}
