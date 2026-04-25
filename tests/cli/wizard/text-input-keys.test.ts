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

    test('meta+leftArrow (Cmd+Left on macOS) jumps to start', () => {
      expect(
        handleTextInputKey(
          { value: 'abc', cursor: 2 },
          '',
          k({ meta: true, leftArrow: true }),
        ),
      ).toEqual({ value: 'abc', cursor: 0 });
    });

    test('meta+rightArrow (Cmd+Right on macOS) jumps to end', () => {
      expect(
        handleTextInputKey(
          { value: 'abc', cursor: 1 },
          '',
          k({ meta: true, rightArrow: true }),
        ),
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

    test('plain meta+letter is ignored (no arrow)', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 1 }, 'x', k({ meta: true })),
      ).toBeNull();
    });
  });

  describe('deletion (both backspace and delete delete-left)', () => {
    test('backspace removes char before cursor', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 2 }, '', k({ backspace: true })),
      ).toEqual({ value: 'ac', cursor: 1 });
    });

    test('backspace at end of value removes last char', () => {
      // Regression: when cursor is at end (cursor === value.length),
      // backspace should still erase the trailing char.
      expect(
        handleTextInputKey({ value: 'hello', cursor: 5 }, '', k({ backspace: true })),
      ).toEqual({ value: 'hell', cursor: 4 });
    });

    test('backspace at start: returns null', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 0 }, '', k({ backspace: true })),
      ).toBeNull();
    });

    test("delete acts like backspace (Mac's main Delete key fires key.delete)", () => {
      // Mac's main Delete key (the one that erases left) shows up as
      // key.delete in some terminals. It must behave like backspace —
      // erase the char to the LEFT of cursor.
      expect(
        handleTextInputKey({ value: 'abc', cursor: 2 }, '', k({ delete: true })),
      ).toEqual({ value: 'ac', cursor: 1 });
    });

    test('delete at end of value removes last char (delete-left)', () => {
      // Regression for the "delete only works mid-text" bug: cursor at
      // end + key.delete must still erase the last char.
      expect(
        handleTextInputKey({ value: 'hello', cursor: 5 }, '', k({ delete: true })),
      ).toEqual({ value: 'hell', cursor: 4 });
    });

    test('delete at start: returns null', () => {
      expect(
        handleTextInputKey({ value: 'abc', cursor: 0 }, '', k({ delete: true })),
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
