import { test, expect, describe } from 'bun:test';
import { handleTextInputKey } from '../../../src/cli/wizard/text-input-keys';

const k = (overrides: Partial<{ leftArrow: boolean; rightArrow: boolean; backspace: boolean; delete: boolean; ctrl: boolean; meta: boolean; return: boolean; upArrow: boolean; downArrow: boolean; escape: boolean }>) => ({
  leftArrow: false,
  rightArrow: false,
  backspace: false,
  delete: false,
  ctrl: false,
  meta: false,
  return: false,
  upArrow: false,
  downArrow: false,
  escape: false,
  ...overrides,
});

describe('handleTextInputKey', () => {
  describe('cursor movement', () => {
    test('left arrow moves cursor left', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 2 }, '', k({ leftArrow: true })),
      ).toEqual({ value: 'abc', cursor: 1 });
    });

    test('left arrow at start: no-op (returns null so caller can decide)', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 0 }, '', k({ leftArrow: true })),
      ).toBeNull();
    });

    test('right arrow moves cursor right', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 1 }, '', k({ rightArrow: true })),
      ).toEqual({ value: 'abc', cursor: 2 });
    });

    test('right arrow at end: returns null', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 3 }, '', k({ rightArrow: true })),
      ).toBeNull();
    });
  });

  describe('home / end', () => {
    test('ctrl+a jumps to start', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 2 }, 'a', k({ ctrl: true })),
      ).toEqual({ value: 'abc', cursor: 0 });
    });

    test('ctrl+e jumps to end', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 1 }, 'e', k({ ctrl: true })),
      ).toEqual({ value: 'abc', cursor: 3 });
    });
  });

  describe('insertion', () => {
    test('insert at end', () => {
      expect(
        handleTextInputKey({ value: 'ab', cursor: 2 }, 'c', k({})),
      ).toEqual({ value: 'abc', cursor: 3 });
    });

    test('insert in middle', () => {
      expect(
        handleTextInputKey({ value: 'ac', cursor: 1 }, 'b', k({})),
      ).toEqual({ value: 'abc', cursor: 2 });
    });

    test('insert at start', () => {
      expect(
        handleTextInputKey({ value: 'bc', cursor: 0 }, 'a', k({})),
      ).toEqual({ value: 'abc', cursor: 1 });
    });

    test('ctrl+key (other than a/e) is ignored', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 1 }, 'k', k({ ctrl: true })),
      ).toBeNull();
    });

    test('meta+key is ignored', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 1 }, 'x', k({ meta: true })),
      ).toBeNull();
    });
  });

  describe('deletion', () => {
    test('backspace removes char before cursor', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 2 }, '', k({ backspace: true })),
      ).toEqual({ value: 'ac', cursor: 1 });
    });

    test('backspace at start: returns null', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 0 }, '', k({ backspace: true })),
      ).toBeNull();
    });

    test('delete removes char at cursor', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 1 }, '', k({ delete: true })),
      ).toEqual({ value: 'ac', cursor: 1 });
    });

    test('delete at end: returns null', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 3 }, '', k({ delete: true })),
      ).toBeNull();
    });
  });

  describe('non-input keys return null (caller takes over)', () => {
    test('up arrow', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 1 }, '', k({ upArrow: true })),
      ).toBeNull();
    });

    test('return / enter', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 1 }, '', k({ return: true })),
      ).toBeNull();
    });

    test('escape', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 1 }, '', k({ escape: true })),
      ).toBeNull();
    });
  });
});
