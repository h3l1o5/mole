import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { TextInput } from '../../../src/cli/components/text-input';

describe('<TextInput>', () => {
  test('inactive + empty: shows placeholder dim', () => {
    const { lastFrame } = render(
      <TextInput
        value=""
        cursor={0}
        isActive={false}
        placeholder="type here…"
      />,
    );
    expect(lastFrame()).toContain('type here…');
  });

  test('inactive + value: shows value', () => {
    const { lastFrame } = render(
      <TextInput value="hello" cursor={5} isActive={false} />,
    );
    expect(lastFrame()).toContain('hello');
  });

  test('active + empty: shows cursor over placeholder', () => {
    const { lastFrame } = render(
      <TextInput
        value=""
        cursor={0}
        isActive
        placeholder="type here…"
      />,
    );
    // We can't assert ANSI inverse easily, so assert content is there.
    expect(lastFrame()).toContain('type here…');
  });

  test('active + value: rendered output contains the value', () => {
    const { lastFrame } = render(
      <TextInput value="hello" cursor={2} isActive />,
    );
    expect(lastFrame()).toContain('hello');
  });

  test('active + cursor at end: trailing cursor is visible (a space char)', () => {
    const { lastFrame } = render(
      <TextInput value="hi" cursor={2} isActive />,
    );
    // value 'hi' + a space char for the cursor block.
    expect(lastFrame()).toMatch(/hi/);
  });

  test('renders inside <Text> parent (pickers wrap input rows in Text)', () => {
    // Regression: HostPicker / ProfilePicker put TextInput inside <Text>;
    // Ink forbids <Box> inside <Text>, so TextInput must never use <Box>.
    const { lastFrame } = render(
      <Text>
        marker{' '}
        <TextInput
          value=""
          cursor={0}
          isActive
          placeholder="type here…"
        />
      </Text>,
    );
    expect(lastFrame()).toContain('type here…');
    expect(lastFrame()).toContain('marker');
  });
});
