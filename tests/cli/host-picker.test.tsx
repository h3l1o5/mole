import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { HostPicker } from '../../src/cli/host-picker';
import type { SshHost } from '../../src/lib/ssh-config';

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

  test('intro mentions ~/.ssh/config so the user knows the source', () => {
    const { lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    expect(lastFrame()).toContain('~/.ssh/config');
  });

  test('the manual-entry row is always present at the bottom', () => {
    const { lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    // When unfocused the input row shows the sentinel hint.
    expect(lastFrame()).toContain('Enter manually');
  });

  test('navigating onto the input row reveals the typing placeholder', async () => {
    const { stdin, lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    await settle();
    for (let i = 0; i < 3; i++) {
      stdin.write('\x1b[B');
      await settle();
    }
    expect(lastFrame()).toContain('user@hostname');
  });

  test('input row is reachable and typeable when ssh config is empty', async () => {
    const { stdin, lastFrame } = render(
      <HostPicker hosts={[]} onSelect={() => {}} />,
    );
    await settle();
    // With no hosts, the input row is index 0 and already focused.
    expect(lastFrame()).toContain('user@hostname');
    expect(lastFrame()).toContain('~/.ssh/config');
  });

  test('host description is shown after a middot separator (not double space)', () => {
    // Double-space separators leave rows without a description looking
    // orphaned. A " · " separator scans cleanly and matches terminal
    // aesthetic (git, breadcrumbs).
    const hostsWithDesc: SshHost[] = [
      { name: 'web', hostname: 'web.example.com', user: 'alice' },
    ];
    const { lastFrame } = render(
      <HostPicker hosts={hostsWithDesc} onSelect={() => {}} />,
    );
    expect(lastFrame()).toContain('web · alice@web.example.com');
  });

  test('intro acknowledges empty ssh config explicitly', () => {
    const { lastFrame } = render(
      <HostPicker hosts={[]} onSelect={() => {}} />,
    );
    // When the list is empty, the "loaded from" copy is misleading; we
    // should acknowledge the empty state instead.
    expect(lastFrame()!.toLowerCase()).toContain('no hosts found');
  });

  test('Enter on first host submits that host', async () => {
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

  test('typing while focused on the input row appears inline', async () => {
    const { stdin, lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    await settle();
    // Move down past three hosts to land on the input row.
    for (let i = 0; i < 3; i++) {
      stdin.write('\x1b[B');
      await settle();
    }
    for (const ch of 'alice@x') {
      stdin.write(ch);
      await settle();
    }
    expect(lastFrame()).toContain('alice@x');
  });

  test('typing while focused on a host row is ignored', async () => {
    const box = { value: null as string | null };
    const { stdin, lastFrame } = render(
      <HostPicker
        hosts={hosts}
        onSelect={(h) => {
          box.value = h.name;
        }}
      />,
    );
    await settle();
    // Stay on first host row (prod) and try to type.
    stdin.write('z');
    await settle();
    // The 'z' should not appear anywhere as input value.
    expect(lastFrame()).not.toContain('z\n');
  });

  test('Enter on input row with user@host submits the typed value', async () => {
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
    for (const ch of 'root@example.com') {
      stdin.write(ch);
      await settle();
    }
    stdin.write('\r');
    await settle();
    expect(box.value).toBe('root@example.com');
  });

  test('Enter on input row without user@host shows error and does not submit', async () => {
    const box = { value: null as string | null };
    const { stdin, lastFrame } = render(
      <HostPicker
        hosts={[]}
        onSelect={(h) => {
          box.value = h.name;
        }}
      />,
    );
    await settle();
    for (const ch of 'just-a-hostname.com') {
      stdin.write(ch);
      await settle();
    }
    stdin.write('\r');
    await settle();
    expect(box.value).toBe(null);
    expect(lastFrame()).toMatch(/user@hostname/i);
  });

  test('typing after a validation error clears the error', async () => {
    const { stdin, lastFrame } = render(
      <HostPicker hosts={[]} onSelect={() => {}} />,
    );
    await settle();
    stdin.write('x');
    await settle();
    stdin.write('\r'); // invalid -> shows error
    await settle();
    expect(lastFrame()).toMatch(/user@hostname/i);
    stdin.write('y');
    await settle();
    // The error message includes the literal "user@hostname" template;
    // typing should clear that whole error line.
    expect(lastFrame()).not.toMatch(/format/i);
  });

  test('Enter on an empty input row does nothing', async () => {
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
    stdin.write('\r');
    await settle();
    expect(box.value).toBe(null);
  });

  test('typed value persists when navigating away and back to input row', async () => {
    const { stdin, lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    await settle();
    for (let i = 0; i < 3; i++) {
      stdin.write('\x1b[B');
      await settle();
    }
    for (const ch of 'kept') {
      stdin.write(ch);
      await settle();
    }
    // Move up to a host row, then back down to the input row.
    stdin.write('\x1b[A');
    await settle();
    stdin.write('\x1b[B');
    await settle();
    expect(lastFrame()).toContain('kept');
  });

  test('backspace deletes from the typed value when focused on input row', async () => {
    const { stdin, lastFrame } = render(
      <HostPicker hosts={[]} onSelect={() => {}} />,
    );
    await settle();
    for (const ch of 'abc') {
      stdin.write(ch);
      await settle();
    }
    stdin.write('\x7f'); // backspace
    await settle();
    const out = lastFrame()!;
    expect(out).toContain('ab');
    expect(out).not.toMatch(/abc/);
  });
});
