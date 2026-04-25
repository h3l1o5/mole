import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { ProfilePicker } from '../../src/cli/profile-picker';
import type { ProfileInfo } from '../../src/lib/chrome-profile';

const makeScanner = (profiles: ProfileInfo[]) => async () => profiles;
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('ProfilePicker', () => {
  test('renders all profiles, with status text only for non-free statuses', async () => {
    const profiles: ProfileInfo[] = [
      { name: 'work', path: '/p/work', status: 'free' },
      { name: 'heavy', path: '/p/heavy', status: 'busy', pid: 123 },
      { name: 'old', path: '/p/old', status: 'reusable', pid: 456 },
    ];
    const { lastFrame } = render(
      <ProfilePicker
        scanner={makeScanner(profiles)}
        intervalMs={20}
        onSelect={() => {}}
      />,
    );
    await settle();
    const out = lastFrame()!;
    expect(out).toContain('work');
    expect(out).toContain('heavy');
    expect(out).toContain('busy');
    expect(out).toContain('old');
    expect(out).toContain('reusable');
  });

  test('free is the default state and shows no redundant label', async () => {
    // free is the only status that needs no warning; surfacing the word
    // "free" next to every ready profile is visual noise. The non-default
    // statuses (busy/reusable/stale) still get their explanatory text.
    const { lastFrame } = render(
      <ProfilePicker
        scanner={makeScanner([
          { name: 'work', path: '/p/work', status: 'free' },
        ])}
        intervalMs={20}
        onSelect={() => {}}
      />,
    );
    await settle();
    const out = lastFrame()!;
    expect(out).toContain('work');
    expect(out).not.toContain('free');
  });

  test('intro mentions ~/.chrome-profiles/', async () => {
    const { lastFrame } = render(
      <ProfilePicker
        scanner={makeScanner([])}
        intervalMs={20}
        onSelect={() => {}}
      />,
    );
    await settle();
    expect(lastFrame()).toContain('~/.chrome-profiles/');
  });

  test('the create-new row is always present at the bottom', async () => {
    const profiles: ProfileInfo[] = [
      { name: 'work', path: '/p/work', status: 'free' },
    ];
    const { lastFrame } = render(
      <ProfilePicker
        scanner={makeScanner(profiles)}
        intervalMs={20}
        onSelect={() => {}}
      />,
    );
    await settle();
    expect(lastFrame()).toContain('Create new profile');
  });

  test('Enter on the first non-busy profile calls onSelect', async () => {
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

  test('Enter on a busy profile does not call onSelect', async () => {
    // Single busy profile: initial focus should jump past it onto the
    // input row (which does nothing on empty Enter).
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

  test('down arrow skips busy rows', async () => {
    const profiles: ProfileInfo[] = [
      { name: 'work', path: '/p/work', status: 'free' },
      { name: 'busy1', path: '/p/b1', status: 'busy', pid: 1 },
      { name: 'spare', path: '/p/spare', status: 'free' },
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
    stdin.write('\x1b[B'); // down: should land on 'spare', not 'busy1'
    await settle(10);
    stdin.write('\r');
    await settle(10);
    expect(box.value).toBe('spare');
  });

  test('Ctrl+N also moves down', async () => {
    const profiles: ProfileInfo[] = [
      { name: 'a', path: '/p/a', status: 'free' },
      { name: 'b', path: '/p/b', status: 'free' },
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
    stdin.write('\x0e'); // Ctrl+N
    await settle(10);
    stdin.write('\r');
    await settle(10);
    expect(box.value).toBe('b');
  });

  test('typing while focused on input row appears inline', async () => {
    const { stdin, lastFrame } = render(
      <ProfilePicker
        scanner={makeScanner([])}
        intervalMs={20}
        onSelect={() => {}}
      />,
    );
    await settle();
    // Empty list -> input row is the only row, focused.
    for (const ch of 'work') {
      stdin.write(ch);
      await settle(5);
    }
    expect(lastFrame()).toContain('work');
  });

  test('typing while focused on a profile row is ignored', async () => {
    const profiles: ProfileInfo[] = [
      { name: 'work', path: '/p/work', status: 'free' },
    ];
    const { stdin, lastFrame } = render(
      <ProfilePicker
        scanner={makeScanner(profiles)}
        intervalMs={20}
        onSelect={() => {}}
      />,
    );
    await settle();
    stdin.write('z');
    await settle();
    // 'z' should not show up as a typed input fragment anywhere.
    expect(lastFrame()).not.toContain(' z\n');
  });

  test('Enter on input row with valid name calls creator then onSelect', async () => {
    const picked = { profile: null as ProfileInfo | null };
    const creatorCalls: string[] = [];
    const fakeInfo: ProfileInfo = {
      name: 'alpha',
      path: '/p/alpha',
      status: 'free',
    };
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
    for (const ch of 'alpha') {
      stdin.write(ch);
      await settle(5);
    }
    stdin.write('\r');
    await settle(10);
    expect(creatorCalls).toEqual(['alpha']);
    expect(picked.profile).toEqual(fakeInfo);
  });

  test('Enter on input row with invalid name shows inline error and does not submit', async () => {
    const creatorCalls: string[] = [];
    const { stdin, lastFrame } = render(
      <ProfilePicker
        scanner={makeScanner([])}
        intervalMs={20}
        creator={(n) => {
          creatorCalls.push(n);
          return { name: n, path: '/x', status: 'free' };
        }}
        onSelect={() => {}}
      />,
    );
    await settle();
    for (const ch of 'foo!') {
      stdin.write(ch);
      await settle(5);
    }
    stdin.write('\r');
    await settle(10);
    expect(creatorCalls).toEqual([]);
    expect(lastFrame()!.toLowerCase()).toContain('invalid');
  });

  test('creator throwing (e.g. duplicate) renders the message inline', async () => {
    const { stdin, lastFrame } = render(
      <ProfilePicker
        scanner={makeScanner([])}
        intervalMs={20}
        creator={() => {
          throw new Error('Profile "alpha" already exists');
        }}
        onSelect={() => {}}
      />,
    );
    await settle();
    for (const ch of 'alpha') {
      stdin.write(ch);
      await settle(5);
    }
    stdin.write('\r');
    await settle(10);
    expect(lastFrame()).toContain('already exists');
  });

  test('typing after a validation error clears the error', async () => {
    const { stdin, lastFrame } = render(
      <ProfilePicker
        scanner={makeScanner([])}
        intervalMs={20}
        onSelect={() => {}}
      />,
    );
    await settle();
    stdin.write('!');
    await settle(5);
    stdin.write('\r'); // invalid -> error shown
    await settle(10);
    expect(lastFrame()!.toLowerCase()).toContain('invalid');
    stdin.write('a');
    await settle(10);
    expect(lastFrame()!.toLowerCase()).not.toContain('invalid');
  });

  test('backspace removes from typed input value', async () => {
    const { stdin, lastFrame } = render(
      <ProfilePicker
        scanner={makeScanner([])}
        intervalMs={20}
        onSelect={() => {}}
      />,
    );
    await settle();
    for (const ch of 'abc') {
      stdin.write(ch);
      await settle(5);
    }
    stdin.write('\x7f');
    await settle(10);
    const out = lastFrame()!;
    expect(out).toContain('ab');
    expect(out).not.toMatch(/abc/);
  });
});
