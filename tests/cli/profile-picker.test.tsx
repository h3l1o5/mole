import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import {
  ProfilePicker,
  statusLabel,
  statusColor,
} from '../../src/cli/profile-picker';
import type { ProfileInfo } from '../../src/lib/chrome-profile';
import type { PickerUiState } from '../../src/cli/wizard/reducer';
import { colors } from '../../src/cli/components/theme';
import { KEY, flush, press } from './ink-keys';

const PROFILE = (
  name: string,
  status: ProfileInfo['status'],
  pid?: number,
): ProfileInfo => ({ name, path: `/p/${name}`, status, pid });

const makeUi = (over: Partial<PickerUiState> = {}): PickerUiState => ({
  index: 0,
  input: '',
  cursor: 0,
  ...over,
});

describe('statusLabel', () => {
  test('exhaustively maps each status to a user-facing string', () => {
    expect(statusLabel('free')).toBe('free');
    expect(statusLabel('reusable')).toMatch(/will attach/);
    expect(statusLabel('stale')).toMatch(/safe/);
    expect(statusLabel('busy')).toMatch(/non-debug Chrome/);
  });
});

describe('statusColor', () => {
  test('free → no color (default text)', () => {
    expect(statusColor('free')).toBeUndefined();
  });

  test('reusable → success, stale → warning, busy → error', () => {
    expect(statusColor('reusable')).toBe(colors.success);
    expect(statusColor('stale')).toBe(colors.warning);
    expect(statusColor('busy')).toBe(colors.error);
  });
});

describe('<ProfilePicker> keyboard wiring', () => {
  test('Enter on a free profile calls onPick with that profile', async () => {
    const picks: Array<ProfileInfo | 'skip'> = [];
    const profiles = [PROFILE('work', 'free'), PROFILE('home', 'free')];
    const { stdin, unmount } = render(
      <ProfilePicker
        profiles={profiles}
        ui={makeUi({ index: 1 })}
        onUiChange={() => {}}
        onPick={(p) => picks.push(p)}
      />,
    );
    await press(stdin, KEY.enter);
    expect(picks).toEqual([profiles[1]!]);
    unmount();
  });

  test('Enter on a busy profile is ignored (no pick)', async () => {
    const picks: Array<ProfileInfo | 'skip'> = [];
    const profiles = [PROFILE('work', 'busy', 12345)];
    const { stdin, unmount } = render(
      <ProfilePicker
        profiles={profiles}
        ui={makeUi({ index: 0 })}
        onUiChange={() => {}}
        onPick={(p) => picks.push(p)}
      />,
    );
    await press(stdin, KEY.enter);
    expect(picks).toEqual([]);
    unmount();
  });

  test('↓ skips over busy profiles when navigating', async () => {
    const patches: Array<Partial<PickerUiState>> = [];
    const profiles = [
      PROFILE('a', 'free'),
      PROFILE('b', 'busy', 1),
      PROFILE('c', 'free'),
    ];
    const { stdin, unmount } = render(
      <ProfilePicker
        profiles={profiles}
        ui={makeUi({ index: 0 })}
        onUiChange={(p) => patches.push(p)}
        onPick={() => {}}
      />,
    );
    await press(stdin, KEY.down);
    expect(patches).toContainEqual({ index: 2 });
    expect(patches).not.toContainEqual({ index: 1 });
    unmount();
  });

  test('initial focus lands on first non-busy profile when first is busy', async () => {
    const patches: Array<Partial<PickerUiState>> = [];
    const profiles = [
      PROFILE('a', 'busy', 1),
      PROFILE('b', 'free'),
      PROFILE('c', 'free'),
    ];
    const { unmount } = render(
      <ProfilePicker
        profiles={profiles}
        ui={makeUi({ index: 0 })}
        onUiChange={(p) => patches.push(p)}
        onPick={() => {}}
      />,
    );
    await flush();
    expect(patches).toContainEqual({ index: 1 });
    unmount();
  });

  test('initial focus falls through to manual-input row when all profiles are busy', async () => {
    const patches: Array<Partial<PickerUiState>> = [];
    const profiles = [PROFILE('a', 'busy', 1), PROFILE('b', 'busy', 2)];
    const { unmount } = render(
      <ProfilePicker
        profiles={profiles}
        ui={makeUi({ index: 0 })}
        onUiChange={(p) => patches.push(p)}
        onPick={() => {}}
      />,
    );
    await flush();
    // inputRowIndex === profiles.length === 2.
    expect(patches).toContainEqual({ index: 2 });
    unmount();
  });

  test('Enter on the skip row calls onPick("skip")', async () => {
    const picks: Array<ProfileInfo | 'skip'> = [];
    const profiles = [PROFILE('work', 'free')];
    // skipRowIndex = profiles.length + 1 = 2.
    const { stdin, unmount } = render(
      <ProfilePicker
        profiles={profiles}
        ui={makeUi({ index: 2 })}
        onUiChange={() => {}}
        onPick={(p) => picks.push(p)}
      />,
    );
    await press(stdin, KEY.enter);
    expect(picks).toEqual(['skip']);
    unmount();
  });

  test('Enter on input row with invalid name shows validation error', async () => {
    const picks: Array<ProfileInfo | 'skip'> = [];
    const profiles = [PROFILE('work', 'free')];
    // inputRowIndex = profiles.length = 1.
    const { stdin, lastFrame, unmount } = render(
      <ProfilePicker
        profiles={profiles}
        ui={makeUi({ index: 1, input: 'bad name', cursor: 8 })}
        onUiChange={() => {}}
        onPick={(p) => picks.push(p)}
      />,
    );
    await press(stdin, KEY.enter);
    expect(picks).toEqual([]);
    // validateProfileName rejects spaces with a message about allowed chars.
    expect(lastFrame()).toMatch(/letters|digits|allowed/i);
    unmount();
  });

  test('Enter on input row with valid name calls creator and onPick', async () => {
    const calls: string[] = [];
    const picks: Array<ProfileInfo | 'skip'> = [];
    const profiles = [PROFILE('work', 'free')];
    const made: ProfileInfo = PROFILE('newone', 'free');
    const { stdin, unmount } = render(
      <ProfilePicker
        profiles={profiles}
        ui={makeUi({ index: 1, input: 'newone', cursor: 6 })}
        onUiChange={() => {}}
        onPick={(p) => picks.push(p)}
        creator={(name) => {
          calls.push(name);
          return made;
        }}
      />,
    );
    await press(stdin, KEY.enter);
    expect(calls).toEqual(['newone']);
    expect(picks).toEqual([made]);
    unmount();
  });

  test('creator throwing surfaces the message as an inline error', async () => {
    const picks: Array<ProfileInfo | 'skip'> = [];
    const profiles = [PROFILE('work', 'free')];
    const { stdin, lastFrame, unmount } = render(
      <ProfilePicker
        profiles={profiles}
        ui={makeUi({ index: 1, input: 'work', cursor: 4 })}
        onUiChange={() => {}}
        onPick={(p) => picks.push(p)}
        creator={() => {
          throw new Error('Profile "work" already exists');
        }}
      />,
    );
    await press(stdin, KEY.enter);
    expect(picks).toEqual([]);
    expect(lastFrame()).toMatch(/already exists/);
    unmount();
  });
});
