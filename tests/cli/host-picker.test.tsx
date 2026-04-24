import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { HostPicker } from '../../src/cli/host-picker';

describe('HostPicker', () => {
  const hosts = [
    { name: 'prod', hostname: 'prod.example.com' },
    { name: 'dev', hostname: 'dev.example.com' },
  ];

  test('renders both hosts with hostname', () => {
    const { lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    const out = lastFrame()!;
    expect(out).toContain('prod');
    expect(out).toContain('prod.example.com');
    expect(out).toContain('dev');
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
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(box.value).toBe('prod');
  });

  test('shows empty message when no hosts', () => {
    const { lastFrame } = render(<HostPicker hosts={[]} onSelect={() => {}} />);
    expect(lastFrame()).toContain('No SSH hosts');
  });
});
