import { existsSync, mkdirSync, readdirSync, readlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type ProfileStatus = 'free' | 'stale' | 'reusable' | 'busy';

export interface ProfileInfo {
  name: string;
  path: string;
  status: ProfileStatus;
  pid?: number;
}

export function parseLockTarget(target: string): number | null {
  const match = target.match(/-(\d+)$/);
  if (!match) return null;
  const n = parseInt(match[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readPidCmdline(pid: number): Promise<string | null> {
  const proc = Bun.spawn(['ps', '-p', String(pid), '-o', 'command='], {
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0) return null;
  const trimmed = out.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type GetCmdline = (pid: number) => Promise<string | null>;

export async function checkProfileStatus(
  profilePath: string,
  getCmdline: GetCmdline = readPidCmdline,
): Promise<{ status: ProfileStatus; pid?: number }> {
  const lockPath = join(profilePath, 'SingletonLock');

  let target: string;
  try {
    target = readlinkSync(lockPath);
  } catch {
    return { status: 'free' };
  }

  const pid = parseLockTarget(target);
  if (pid === null) return { status: 'free' };

  if (!isPidAlive(pid)) {
    return { status: 'stale', pid };
  }

  const cmdline = await getCmdline(pid);
  if (cmdline && cmdline.includes('--remote-debugging-port')) {
    return { status: 'reusable', pid };
  }

  return { status: 'busy', pid };
}

const PROFILE_NAME_RE = /^[A-Za-z0-9._-]+$/;

export function createProfile(
  name: string,
  baseDir: string = join(homedir(), '.chrome-profiles'),
): ProfileInfo {
  if (!PROFILE_NAME_RE.test(name) || name.length > 64 || name === '.' || name === '..') {
    throw new Error(`Invalid profile name: "${name}"`);
  }
  const path = join(baseDir, name);
  if (existsSync(path)) {
    throw new Error(`Profile "${name}" already exists`);
  }
  mkdirSync(path, { recursive: true });
  return { name, path, status: 'free' };
}

export async function scanProfiles(
  baseDir: string = join(homedir(), '.chrome-profiles'),
  getCmdline: GetCmdline = readPidCmdline,
): Promise<ProfileInfo[]> {
  if (!existsSync(baseDir)) return [];

  const entries = readdirSync(baseDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  const results: ProfileInfo[] = [];
  for (const e of dirs) {
    const path = join(baseDir, e.name);
    const { status, pid } = await checkProfileStatus(path, getCmdline);
    results.push({ name: e.name, path, status, pid });
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}
