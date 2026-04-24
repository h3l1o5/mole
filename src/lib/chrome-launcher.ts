export interface ChromeLaunchOptions {
  profilePath: string;
  port?: number;
}

export function buildChromeArgs(opts: ChromeLaunchOptions): string[] {
  const port = opts.port ?? 9222;
  return [
    '-na',
    'Google Chrome',
    '--args',
    `--user-data-dir=${opts.profilePath}`,
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
  ];
}

export function launchChrome(opts: ChromeLaunchOptions): void {
  Bun.spawn(['open', ...buildChromeArgs(opts)], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}
