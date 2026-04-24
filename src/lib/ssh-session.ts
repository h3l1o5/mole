import { spawn, type ChildProcess } from 'node:child_process';

export interface SshOptions {
  host: string;
  clipSocket?: string;
  chromeSocket?: string;
  chromePort?: number;
}

export function buildSshArgs(opts: SshOptions): string[] {
  const clip = opts.clipSocket ?? '/tmp/mole-clip.sock';
  const chrome = opts.chromeSocket ?? '/tmp/mole-chrome.sock';
  const port = opts.chromePort ?? 9222;
  return [
    '-t', '-t',
    '-o', 'StreamLocalBindUnlink=yes',
    '-o', 'ExitOnForwardFailure=no',
    '-R', `${clip}:${clip}`,
    '-R', `${chrome}:127.0.0.1:${port}`,
    opts.host,
  ];
}

export function spawnSsh(opts: SshOptions): ChildProcess {
  return spawn('ssh', buildSshArgs(opts), { stdio: 'inherit' });
}
