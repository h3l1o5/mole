export function buildNonInteractiveSshArgs(
  host: string,
  command: string[],
): string[] {
  return [
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
    host,
    ...command,
  ];
}
