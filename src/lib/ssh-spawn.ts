export function buildNonInteractiveSshArgs(
  host: string,
  command: string[],
): string[] {
  return [
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'ControlMaster=no',
    '-o',
    'ControlPath=none',
    host,
    ...command,
  ];
}
