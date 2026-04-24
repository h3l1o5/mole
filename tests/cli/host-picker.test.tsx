import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { HostPicker } from '../../src/cli/host-picker';

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('HostPicker', () => {
  const hosts = [
    { name: 'prod', hostname: 'prod.example.com', user: 'alice' },
    { name: 'dev', hostname: 'dev.example.com' },
    { name: 'work', user: 'bob' },
  ];

  test('renders all hosts', () => {
    const { lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    const out = lastFrame()!;
    expect(out).toContain('prod');
    expect(out).toContain('dev');
    expect(out).toContain('work');
  });

  test('shows user@hostname when User is set', () => {
    const { lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    expect(lastFrame()).toContain('alice@prod.example.com');
  });

  test('shows hostname alone when no User is set', () => {
    const { lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    expect(lastFrame()).toContain('dev.example.com');
  });

  test('falls back to user@alias when HostName is missing', () => {
    const { lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    expect(lastFrame()).toContain('bob@work');
  });

  test('intro mentions ~/.ssh/config so user knows source of options', () => {
    const { lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    expect(lastFrame()).toContain('~/.ssh/config');
  });

  test('always shows a manual-entry sentinel below the host list', () => {
    const { lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    const out = lastFrame()!;
    expect(out.toLowerCase()).toContain('enter manually');
  });

  test('sentinel is shown even when the ssh config is empty', () => {
    const { lastFrame } = render(
      <HostPicker hosts={[]} onSelect={() => {}} />,
    );
    const out = lastFrame()!;
    expect(out.toLowerCase()).toContain('enter manually');
    expect(out).toContain('~/.ssh/config');
  });

  test('enter selects first host', async () => {
    const box = { value: null as string | null };
    const { stdin } = render(
      <HostPicker
        hosts={hosts}
        onSelect={(h) => {
          box.value = h.name;
        }}
      />,
    );
    await settle();
    stdin.write('\r');
    await settle();
    expect(box.value).toBe('prod');
  });

  test('selecting the manual-entry sentinel switches to input mode', async () => {
    const { stdin, lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    await settle();
    // Navigate past all three hosts, landing on the sentinel.
    stdin.write('\x1b[B');
    await settle();
    stdin.write('\x1b[B');
    await settle();
    stdin.write('\x1b[B');
    await settle();
    stdin.write('\r');
    await settle();
    // HostInput's placeholder is the tell.
    expect(lastFrame()).toContain('user@hostname');
  });

  test('manual entry submits the typed host via onSelect', async () => {
    const box = { value: null as string | null };
    const { stdin } = render(
      <HostPicker
        hosts={[]}
        onSelect={(h) => {
          box.value = h.name;
        }}
      />,
    );
    await settle();
    // Empty list: first option is already the sentinel.
    stdin.write('\r');
    await settle();
    for (const ch of 'alice@custom.example.com') {
      stdin.write(ch);
      await settle();
    }
    stdin.write('\r');
    await settle();
    expect(box.value).toBe('alice@custom.example.com');
  });

  test('Esc in manual-entry returns to the picker', async () => {
    const { stdin, lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    await settle();
    stdin.write('\x1b[B');
    await settle();
    stdin.write('\x1b[B');
    await settle();
    stdin.write('\x1b[B');
    await settle();
    stdin.write('\r');
    await settle();
    // Now in input mode; press Esc to return.
    stdin.write('\x1b');
    await settle();
    // Picker headline reappears.
    expect(lastFrame()).toContain('SSH host');
  });
});
