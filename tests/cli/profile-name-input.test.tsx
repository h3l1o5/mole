import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { ProfileNameInput } from '../../src/cli/profile-name-input';

const settle = () => new Promise((r) => setTimeout(r, 10));

describe('ProfileNameInput', () => {
  test('typing populates visible value', async () => {
    const { stdin, lastFrame } = render(
      <ProfileNameInput onSubmit={() => {}} onCancel={() => {}} />,
    );
    await settle();
    stdin.write('w');
    stdin.write('o');
    stdin.write('r');
    stdin.write('k');
    await settle();
    expect(lastFrame()).toContain('work');
  });

  test('Enter with valid name calls onSubmit', async () => {
    const box = { name: null as string | null };
    const { stdin } = render(
      <ProfileNameInput
        onSubmit={(n) => {
          box.name = n;
        }}
        onCancel={() => {}}
      />,
    );
    await settle();
    for (const ch of 'personal') stdin.write(ch);
    stdin.write('\r');
    await settle();
    expect(box.name).toBe('personal');
  });

  test('Enter with empty name does not submit, shows error', async () => {
    const box = { name: null as string | null };
    const { stdin, lastFrame } = render(
      <ProfileNameInput
        onSubmit={(n) => {
          box.name = n;
        }}
        onCancel={() => {}}
      />,
    );
    await settle();
    stdin.write('\r');
    await settle();
    expect(box.name).toBe(null);
    expect(lastFrame()!.toLowerCase()).toMatch(/invalid|required/);
  });

  test('Enter with invalid char shows error and does not submit', async () => {
    const box = { name: null as string | null };
    const { stdin, lastFrame } = render(
      <ProfileNameInput
        onSubmit={(n) => {
          box.name = n;
        }}
        onCancel={() => {}}
      />,
    );
    await settle();
    for (const ch of 'foo!') stdin.write(ch);
    stdin.write('\r');
    await settle();
    expect(box.name).toBe(null);
    expect(lastFrame()!.toLowerCase()).toContain('invalid');
  });

  test('ESC calls onCancel', async () => {
    const box = { cancelled: false };
    const { stdin } = render(
      <ProfileNameInput
        onSubmit={() => {}}
        onCancel={() => {
          box.cancelled = true;
        }}
      />,
    );
    await settle();
    stdin.write('\x1b'); // ESC
    await settle();
    expect(box.cancelled).toBe(true);
  });

  test('backspace removes last character', async () => {
    const { stdin, lastFrame } = render(
      <ProfileNameInput onSubmit={() => {}} onCancel={() => {}} />,
    );
    await settle();
    for (const ch of 'work') stdin.write(ch);
    stdin.write('\x7f'); // backspace (DEL)
    await settle();
    expect(lastFrame()).toContain('wor');
    expect(lastFrame()).not.toContain('work');
  });
});
