import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { ProfilePicker } from '../../src/cli/profile-picker';
import type { ProfileInfo } from '../../src/lib/chrome-profile';

const makeScanner = (profiles: ProfileInfo[]) => async () => profiles;
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('ProfilePicker', () => {
  test('renders status labels', async () => {
    const profiles: ProfileInfo[] = [
      { name: 'work', path: '/p/work', status: 'free' },
      { name: 'heavy', path: '/p/heavy', status: 'busy', pid: 123 },
      { name: 'old', path: '/p/old', status: 'reusable', pid: 456 },
    ];
    const { lastFrame } = render(
      <ProfilePicker scanner={makeScanner(profiles)} intervalMs={20} onSelect={() => {}} />,
    );
    await settle();
    const out = lastFrame()!;
    expect(out).toContain('work');
    expect(out).toContain('free');
    expect(out).toContain('heavy');
    expect(out).toContain('busy');
    expect(out).toContain('old');
    expect(out).toContain('reusable');
  });

  test('enter on busy does not call onSelect', async () => {
    const profiles: ProfileInfo[] = [
      { name: 'busy1', path: '/p/b1', status: 'busy', pid: 1 },
    ];
    const box = { value: null as string | null };
    const { stdin } = render(
      <ProfilePicker
        scanner={makeScanner(profiles)}
        intervalMs={20}
        onSelect={(p) => {
          box.value = p.name;
        }}
      />,
    );
    await settle();
    stdin.write('\r');
    await settle(10);
    expect(box.value).toBe(null);
  });

  test('enter on free profile calls onSelect', async () => {
    const profiles: ProfileInfo[] = [
      { name: 'work', path: '/p/work', status: 'free' },
    ];
    const box = { value: null as string | null };
    const { stdin } = render(
      <ProfilePicker
        scanner={makeScanner(profiles)}
        intervalMs={20}
        onSelect={(p) => {
          box.value = p.name;
        }}
      />,
    );
    await settle();
    stdin.write('\r');
    await settle(10);
    expect(box.value).toBe('work');
  });

  test('shows "Create new profile" sentinel even when list is empty', async () => {
    const { lastFrame } = render(
      <ProfilePicker scanner={makeScanner([])} intervalMs={20} onSelect={() => {}} />,
    );
    await settle();
    expect(lastFrame()).toContain('Create new profile');
  });

  test('selecting sentinel switches to name-input mode', async () => {
    const { stdin, lastFrame } = render(
      <ProfilePicker scanner={makeScanner([])} intervalMs={20} onSelect={() => {}} />,
    );
    await settle();
    stdin.write('\r'); // only item is sentinel
    await settle(10);
    expect(lastFrame()).toContain('New profile name');
  });

  test('submitting valid name invokes creator then onSelect', async () => {
    const picked = { profile: null as ProfileInfo | null };
    const creatorCalls: string[] = [];
    const fakeInfo: ProfileInfo = { name: 'alpha', path: '/p/alpha', status: 'free' };
    const creator = (n: string) => {
      creatorCalls.push(n);
      return fakeInfo;
    };
    const { stdin } = render(
      <ProfilePicker
        scanner={makeScanner([])}
        intervalMs={20}
        creator={creator}
        onSelect={(p) => {
          picked.profile = p;
        }}
      />,
    );
    await settle();
    stdin.write('\r'); // select sentinel
    await settle(10);
    for (const ch of 'alpha') stdin.write(ch);
    stdin.write('\r');
    await settle(10);
    expect(creatorCalls).toEqual(['alpha']);
    expect(picked.profile).toEqual(fakeInfo);
  });

  test('ESC from name-input returns to list', async () => {
    const { stdin, lastFrame } = render(
      <ProfilePicker scanner={makeScanner([])} intervalMs={20} onSelect={() => {}} />,
    );
    await settle();
    stdin.write('\r'); // enter creating mode
    await settle(50);
    expect(lastFrame()).toContain('New profile name');
    stdin.write('\x1b'); // ESC
    await settle(50);
    expect(lastFrame()).toContain('Create new profile');
    expect(lastFrame()).not.toContain('New profile name');
  });
});
