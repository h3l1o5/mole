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

  test('renders description alongside label when provided', () => {
    const itemsWithDescription = [
      { key: 'a', label: 'prod', description: 'prod.example.com', value: 'a' },
      { key: 'b', label: 'dev', description: 'dev.example.com', value: 'b' },
    ];
    const { lastFrame } = render(
      <SelectList items={itemsWithDescription} onSelect={() => {}} />,
    );
    const out = lastFrame()!;
    expect(out).toContain('prod');
    expect(out).toContain('prod.example.com');
    expect(out).toContain('dev');
    expect(out).toContain('dev.example.com');
  });

  test('Ctrl+N moves selection down', async () => {
    const { stdin, lastFrame } = render(
      <SelectList items={items} onSelect={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\x0e'); // Ctrl+N
    await new Promise((r) => setTimeout(r, 10));
    // Alpha -> (skip disabled Beta) -> Gamma
    expect(lastFrame()!).toMatch(/›\s*Gamma/);
  });

  test('Ctrl+P moves selection up', async () => {
    const { stdin, lastFrame } = render(
      <SelectList items={items} onSelect={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\x1b[B'); // down to skip disabled -> Gamma
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('\x10'); // Ctrl+P
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()!).toMatch(/›\s*Alpha/);
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
