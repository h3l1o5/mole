import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { HostPicker } from '../../src/cli/host-picker';
import { icons } from '../../src/cli/components/theme';

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

  test('shows a prompt with keyboard hint at the top', () => {
    const { lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    const out = lastFrame()!;
    expect(out).toContain('Select SSH host');
    // Hint contains the arrow characters and "Enter" so the user knows
    // how to drive the picker even on first run.
    expect(out).toMatch(/↑↓/);
    expect(out).toContain('Enter');
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

  test('empty state uses the warning StatusMessage pattern', () => {
    const { lastFrame } = render(<HostPicker hosts={[]} onSelect={() => {}} />);
    const out = lastFrame()!;
    expect(out).toContain('No SSH hosts');
    // StatusMessage renders the figures.warning icon on its own Text node.
    expect(out).toContain(icons.warning);
  });
});
