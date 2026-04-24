import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { HostInput } from '../../src/cli/host-input';

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('HostInput', () => {
  test('renders placeholder text before any input', () => {
    const { lastFrame, unmount } = render(
      <HostInput onSubmit={() => {}} onCancel={() => {}} />,
    );
    expect(lastFrame()).toContain('user@hostname');
    unmount();
  });

  test('typing characters appears in the value slot', async () => {
    const { lastFrame, stdin, unmount } = render(
      <HostInput onSubmit={() => {}} onCancel={() => {}} />,
    );
    await settle();
    stdin.write('a');
    await settle();
    stdin.write('b');
    await settle();
    expect(lastFrame()).toContain('ab');
    unmount();
  });

  test('Enter submits the trimmed value', async () => {
    const box = { value: null as string | null };
    const { stdin, unmount } = render(
      <HostInput
        onSubmit={(v) => {
          box.value = v;
        }}
        onCancel={() => {}}
      />,
    );
    await settle();
    stdin.write('x');
    await settle();
    stdin.write('y');
    await settle();
    stdin.write('\r');
    await settle();
    expect(box.value).toBe('xy');
    unmount();
  });

  test('Enter on empty input does not submit', async () => {
    const box = { submitted: false };
    const { stdin, unmount } = render(
      <HostInput
        onSubmit={() => {
          box.submitted = true;
        }}
        onCancel={() => {}}
      />,
    );
    await settle();
    stdin.write('\r');
    await settle();
    expect(box.submitted).toBe(false);
    unmount();
  });

  test('Esc triggers onCancel', async () => {
    const box = { cancelled: false };
    const { stdin, unmount } = render(
      <HostInput
        onSubmit={() => {}}
        onCancel={() => {
          box.cancelled = true;
        }}
      />,
    );
    await settle();
    stdin.write('\x1b'); // Esc
    await settle();
    expect(box.cancelled).toBe(true);
    unmount();
  });

  test('backspace removes the last character', async () => {
    const { stdin, lastFrame, unmount } = render(
      <HostInput onSubmit={() => {}} onCancel={() => {}} />,
    );
    await settle();
    stdin.write('a');
    await settle();
    stdin.write('b');
    await settle();
    stdin.write('\x7f'); // DEL / backspace
    await settle();
    const out = lastFrame()!;
    expect(out).toContain('a');
    expect(out).not.toMatch(/ab/);
    unmount();
  });
});
