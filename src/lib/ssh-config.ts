import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SshHost {
  name: string;
  hostname?: string;
  user?: string;
}

const isPattern = (name: string): boolean =>
  name.includes('*') || name.includes('?') || name.startsWith('!');

// Either "Key value" or "Key=value" (ssh_config accepts both per ssh_config(5)).
const KV_RE = /^([A-Za-z]+)(?:\s*=\s*|\s+)(.+)$/;

export function parseSshConfig(content: string): SshHost[] {
  const hosts: SshHost[] = [];
  let current: SshHost[] | null = null;

  const flush = () => {
    if (current) hosts.push(...current);
    current = null;
  };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Match blocks are conditional config we never evaluate. Treat them
    // as a hard boundary so directives inside can't leak into the
    // previous Host block.
    if (/^Match(\s|$)/i.test(line)) {
      flush();
      continue;
    }

    const hostMatch = line.match(/^Host\s+(.+)$/i);
    if (hostMatch) {
      flush();
      const names = hostMatch[1]!
        .split(/\s+/)
        .filter((n) => n.length > 0 && !isPattern(n));
      current = names.length > 0 ? names.map((name) => ({ name })) : null;
      continue;
    }

    if (!current) continue;

    const kv = line.match(KV_RE);
    if (!kv) continue;
    const lowerKey = kv[1]!.toLowerCase();
    const value = kv[2]!.trim();
    if (lowerKey === 'hostname') {
      for (const h of current) h.hostname = value;
    } else if (lowerKey === 'user') {
      for (const h of current) h.user = value;
    }
  }

  flush();
  return hosts;
}

export function loadSshHosts(
  configPath: string = join(homedir(), '.ssh', 'config'),
): SshHost[] {
  if (!existsSync(configPath)) return [];
  return parseSshConfig(readFileSync(configPath, 'utf8'));
}

// Expand the small subset of ssh_config TOKENS we care about for display.
// %h and %n both resolve to the original target host on the command line,
// which for us is always the alias the user picked.
function expandTokens(s: string, alias: string): string {
  return s.replace(/%[hn]/g, alias);
}

// Render a one-line description of how this host will be reached.
//   user + hostname → "user@hostname"   (with %h/%n expanded)
//   user only       → "user@alias"      (HostName falls back to alias)
//   hostname only   → "hostname"        (with %h/%n expanded)
//   neither         → undefined         (caller should hide the column)
export function describeHost(h: SshHost): string | undefined {
  const right = h.hostname ? expandTokens(h.hostname, h.name) : h.name;
  if (h.user && h.hostname) return `${h.user}@${right}`;
  if (h.user) return `${h.user}@${right}`;
  if (h.hostname) return right;
  return undefined;
}
