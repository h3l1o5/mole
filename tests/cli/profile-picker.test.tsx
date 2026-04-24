import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { ProfilePicker } from '../../src/cli/profile-picker';
import type { ProfileInfo } from '../../src/lib/chrome-profile';

const makeScanner = (profiles: ProfileInfo[]) => async () => profiles;

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
    await new Promise((r) => setTimeout(r, 30));
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
    await new Promise((r) => setTimeout(r, 30));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
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
    await new Promise((r) => setTimeout(r, 30));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(box.value).toBe('work');
  });

  test('shows empty message when no profiles', () => {
    const { lastFrame } = render(
      <ProfilePicker scanner={makeScanner([])} intervalMs={20} onSelect={() => {}} />,
    );
    expect(lastFrame()).toContain('No Chrome profiles');
  });
});
