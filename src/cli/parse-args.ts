export type ParsedArgs =
  | { kind: 'version' }
  | { kind: 'connect' }
  | { kind: 'uninstall'; yes: boolean };

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.includes('--version') || argv.includes('-v')) {
    return { kind: 'version' };
  }
  if (argv[0] === 'uninstall') {
    const rest = argv.slice(1);
    const yes = rest.includes('--yes') || rest.includes('-y');
    return { kind: 'uninstall', yes };
  }
  return { kind: 'connect' };
}
