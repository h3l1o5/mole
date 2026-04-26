import { test, expect, describe } from 'bun:test';
import { matchExtraKey } from '../../../src/cli/hooks/use-extra-keys';

describe('matchExtraKey', () => {
  test.each([
    ['xterm', '\x1b[H'],
    ['vt220 / SS3', '\x1bOH'],
    ['linux console', '\x1b[1~'],
    ['rxvt', '\x1b[7~'],
  ])('recognises Home (%s: %j)', (_label, seq) => {
    expect(matchExtraKey(seq)).toBe('home');
  });

  test.each([
    ['xterm', '\x1b[F'],
    ['vt220 / SS3', '\x1bOF'],
    ['linux console', '\x1b[4~'],
    ['rxvt', '\x1b[8~'],
  ])('recognises End (%s: %j)', (_label, seq) => {
    expect(matchExtraKey(seq)).toBe('end');
  });

  test('returns null for unrelated escape sequences', () => {
    expect(matchExtraKey('\x1b[A')).toBeNull(); // up arrow
    expect(matchExtraKey('\x1b[B')).toBeNull(); // down arrow
    expect(matchExtraKey('\x1b[C')).toBeNull(); // right arrow
    expect(matchExtraKey('\x1b[D')).toBeNull(); // left arrow
  });

  test('returns null for plain printable input', () => {
    expect(matchExtraKey('a')).toBeNull();
    expect(matchExtraKey('')).toBeNull();
    expect(matchExtraKey('Home')).toBeNull();
  });

  test('only exact-match — substring containing the sequence does not match', () => {
    // Ink delivers each escape sequence as one chunk; a longer chunk
    // that happens to contain "\x1b[H" should not be misread as Home.
    expect(matchExtraKey('\x1b[H ')).toBeNull();
    expect(matchExtraKey(' \x1b[H')).toBeNull();
  });
});
