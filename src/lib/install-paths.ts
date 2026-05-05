import { homedir } from 'os';
import { join } from 'path';

const HOME = homedir();

export const PATHS = {
  binDir: join(HOME, '.local', 'bin'),
  logDir: join(HOME, '.local', 'state', 'mole'),
  laDir: join(HOME, 'Library', 'LaunchAgents'),
  daemonLabel: 'com.h3l1o5.mole-daemon',
  socket: '/tmp/mole-clip.sock',
} as const;

export function plistPath(): string {
  return join(PATHS.laDir, `${PATHS.daemonLabel}.plist`);
}

export function pathsToRemove(): string[] {
  return [
    join(PATHS.binDir, 'mole'),
    join(PATHS.binDir, 'mole-daemon'),
    join(PATHS.binDir, 'mole-pasteboard'),
    plistPath(),
    PATHS.logDir,
    PATHS.socket,
  ];
}
