import { test, expect, describe } from 'bun:test';
import { parseArgs } from '../../src/cli/parse-args';

describe('parseArgs', () => {
  test('no args → connect', () => {
    expect(parseArgs([])).toEqual({ kind: 'connect' });
  });

  test('--version → version', () => {
    expect(parseArgs(['--version'])).toEqual({ kind: 'version' });
  });

  test('-v alias → version', () => {
    expect(parseArgs(['-v'])).toEqual({ kind: 'version' });
  });

  test('uninstall → uninstall {yes:false}', () => {
    expect(parseArgs(['uninstall'])).toEqual({ kind: 'uninstall', yes: false });
  });

  test('uninstall --yes → uninstall {yes:true}', () => {
    expect(parseArgs(['uninstall', '--yes'])).toEqual({
      kind: 'uninstall',
      yes: true,
    });
  });

  test('uninstall -y alias → uninstall {yes:true}', () => {
    expect(parseArgs(['uninstall', '-y'])).toEqual({
      kind: 'uninstall',
      yes: true,
    });
  });

  test('--version takes priority over uninstall', () => {
    expect(parseArgs(['uninstall', '--version'])).toEqual({ kind: 'version' });
  });
});
