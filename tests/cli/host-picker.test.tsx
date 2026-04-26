import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { HostPicker, validateUserHost } from '../../src/cli/host-picker';
import type { SshHost } from '../../src/lib/ssh-config';
import type { PickerUiState } from '../../src/cli/wizard/reducer';

const HOSTS: SshHost[] = [
  { name: 'vbm', user: 'root', hostname: 'martyvbm.syno' },
  { name: 'prod', user: 'alice', hostname: 'p.example.com' },
];

const makeUi = (over: Partial<PickerUiState> = {}): PickerUiState => ({
  index: 0,
  input: '',
  cursor: 0,
  ...over,
});

const KEY = {
  enter: '\r',
  down: '\x1b[B',
  up: '\x1b[A',
};

const flush = () => new Promise((r) => setTimeout(r, 20));

// useInput attaches its data listener in a useEffect that runs after
// the first paint. Tests must flush once before writing to stdin so
// the listener is wired up.
const press = async (
  stdin: { write: (s: string) => void },
  data: string,
): Promise<void> => {
  await flush();
  stdin.write(data);
  await flush();
};

describe('validateUserHost', () => {
  test('null on valid user@host', () => {
    expect(validateUserHost('root@example.com')).toBeNull();
    expect(validateUserHost('alice@10.0.0.1')).toBeNull();
    expect(validateUserHost('user.name@host-1.local')).toBeNull();
  });

  test('null on empty / whitespace (picker ignores Enter on blank)', () => {
    expect(validateUserHost('')).toBeNull();
    expect(validateUserHost('   ')).toBeNull();
  });

  test('error when the @ separator is missing', () => {
    expect(validateUserHost('justhost')).toMatch(/user@hostname/);
  });

  test('error when user side is empty', () => {
    expect(validateUserHost('@host')).toMatch(/user@hostname/);
  });

  test('error when host side is empty', () => {
    expect(validateUserHost('user@')).toMatch(/user@hostname/);
  });

  test('error when input contains whitespace', () => {
    expect(validateUserHost('user @host')).toMatch(/user@hostname/);
    expect(validateUserHost('user@ho st')).toMatch(/user@hostname/);
  });

  test('error when there are multiple @ signs', () => {
    expect(validateUserHost('a@b@c')).toMatch(/user@hostname/);
  });

  test('trims surrounding whitespace before validating', () => {
    expect(validateUserHost('  root@example.com  ')).toBeNull();
  });
});

describe('<HostPicker> keyboard wiring', () => {
  test('Enter on a list row calls onPick with that host', async () => {
    const picks: SshHost[] = [];
    const { stdin, unmount } = render(
      <HostPicker
        hosts={HOSTS}
        ui={makeUi({ index: 1 })}
        onUiChange={() => {}}
        onPick={(h) => picks.push(h)}
      />,
    );
    await press(stdin, KEY.enter);
    expect(picks).toEqual([HOSTS[1]!]);
    unmount();
  });

  test('↓ from last list row dispatches index→inputRowIndex via onUiChange', async () => {
    const patches: Array<Partial<PickerUiState>> = [];
    const { stdin, unmount } = render(
      <HostPicker
        hosts={HOSTS}
        ui={makeUi({ index: HOSTS.length - 1 })}
        onUiChange={(p) => patches.push(p)}
        onPick={() => {}}
      />,
    );
    await press(stdin, KEY.down);
    expect(patches).toContainEqual({ index: HOSTS.length });
    unmount();
  });

  test('↓ at the input row (last row) does not advance past it', async () => {
    const patches: Array<Partial<PickerUiState>> = [];
    const { stdin, unmount } = render(
      <HostPicker
        hosts={HOSTS}
        ui={makeUi({ index: HOSTS.length })}
        onUiChange={(p) => patches.push(p)}
        onPick={() => {}}
      />,
    );
    await press(stdin, KEY.down);
    expect(patches).toEqual([]);
    unmount();
  });

  test('Enter on input row with blank input does not pick or error', async () => {
    const picks: SshHost[] = [];
    const { stdin, lastFrame, unmount } = render(
      <HostPicker
        hosts={HOSTS}
        ui={makeUi({ index: HOSTS.length, input: '   ' })}
        onUiChange={() => {}}
        onPick={(h) => picks.push(h)}
      />,
    );
    await press(stdin, KEY.enter);
    expect(picks).toEqual([]);
    expect(lastFrame()).not.toMatch(/Use format user@hostname/);
    unmount();
  });

  test('Enter on input row with malformed text shows validation error and does not pick', async () => {
    const picks: SshHost[] = [];
    const { stdin, lastFrame, unmount } = render(
      <HostPicker
        hosts={HOSTS}
        ui={makeUi({ index: HOSTS.length, input: 'no-at-sign', cursor: 10 })}
        onUiChange={() => {}}
        onPick={(h) => picks.push(h)}
      />,
    );
    await press(stdin, KEY.enter);
    expect(picks).toEqual([]);
    expect(lastFrame()).toMatch(/Use format user@hostname/);
    unmount();
  });

  test('Enter on input row with valid user@host calls onPick({ name })', async () => {
    const picks: SshHost[] = [];
    const { stdin, unmount } = render(
      <HostPicker
        hosts={HOSTS}
        ui={makeUi({ index: HOSTS.length, input: 'root@new.host', cursor: 13 })}
        onUiChange={() => {}}
        onPick={(h) => picks.push(h)}
      />,
    );
    await press(stdin, KEY.enter);
    expect(picks).toEqual([{ name: 'root@new.host' }]);
    unmount();
  });

  test('renders empty-state hint when there are no hosts in ssh config', () => {
    const { lastFrame, unmount } = render(
      <HostPicker
        hosts={[]}
        ui={makeUi({ index: 0 })}
        onUiChange={() => {}}
        onPick={() => {}}
      />,
    );
    expect(lastFrame()).toMatch(/No hosts in ~\/\.ssh\/config/);
    unmount();
  });
});
