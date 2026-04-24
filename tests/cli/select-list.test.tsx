import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { SelectList } from '../../src/cli/components/select-list';

describe('SelectList', () => {
  const items = [
    { key: 'a', label: 'Alpha', value: 'a' },
    { key: 'b', label: 'Beta', value: 'b', disabled: true },
    { key: 'c', label: 'Gamma', value: 'c' },
  ];

  test('renders all items and marks highlight', () => {
    const { lastFrame } = render(
      <SelectList items={items} onSelect={() => {}} />,
    );
    const out = lastFrame()!;
    expect(out).toContain('Alpha');
    expect(out).toContain('Beta');
    expect(out).toContain('Gamma');
    expect(out).toMatch(/›\s*Alpha/);
  });

  test('down arrow skips disabled items', async () => {
    const { stdin, lastFrame } = render(
      <SelectList items={items} onSelect={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\x1b[B'); // down arrow
    await new Promise((r) => setTimeout(r, 10));
    const out = lastFrame()!;
    expect(out).toMatch(/›\s*Gamma/);
    expect(out).not.toMatch(/›\s*Beta/);
  });

  test('enter calls onSelect with current value', async () => {
    const box = { value: null as string | null };
    const { stdin } = render(
      <SelectList
        items={items}
        onSelect={(v) => {
          box.value = v;
        }}
      />,
    );
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(box.value).toBe('a');
  });

  test('enter on disabled does nothing', async () => {
    const itemsAllDisabled = [
      { key: 'a', label: 'A', value: 'a', disabled: true },
    ];
    const box = { value: null as string | null };
    const { stdin } = render(
      <SelectList
        items={itemsAllDisabled}
        onSelect={(v) => {
          box.value = v;
        }}
      />,
    );
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(box.value).toBe(null);
  });
});
