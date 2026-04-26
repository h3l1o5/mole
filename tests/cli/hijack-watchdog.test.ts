import { test, expect, describe } from 'bun:test';
import { evaluateStrike } from '../../src/cli/hijack-watchdog';

describe('evaluateStrike', () => {
  test('first mismatch increments strikes but does not fire', () => {
    expect(evaluateStrike(0, 'mismatch')).toEqual({ strikes: 1, fire: false });
  });

  test('second consecutive mismatch fires', () => {
    expect(evaluateStrike(1, 'mismatch')).toEqual({ strikes: 2, fire: true });
  });

  test("'ok' resets strikes regardless of prior count", () => {
    expect(evaluateStrike(0, 'ok')).toEqual({ strikes: 0, fire: false });
    expect(evaluateStrike(1, 'ok')).toEqual({ strikes: 0, fire: false });
  });

  test("'unreachable' resets strikes — transient ssh blips must not accumulate", () => {
    expect(evaluateStrike(0, 'unreachable')).toEqual({ strikes: 0, fire: false });
    expect(evaluateStrike(1, 'unreachable')).toEqual({ strikes: 0, fire: false });
  });

  test('mismatch → unreachable → mismatch does not fire (reset interrupts the streak)', () => {
    let strikes = 0;
    strikes = evaluateStrike(strikes, 'mismatch').strikes;
    expect(strikes).toBe(1);
    const afterUnreachable = evaluateStrike(strikes, 'unreachable');
    expect(afterUnreachable.fire).toBe(false);
    strikes = afterUnreachable.strikes;
    expect(strikes).toBe(0);
    const afterMismatch = evaluateStrike(strikes, 'mismatch');
    expect(afterMismatch).toEqual({ strikes: 1, fire: false });
  });

  test('mismatch → mismatch fires on second hit (the canonical hijack sequence)', () => {
    let strikes = 0;
    const first = evaluateStrike(strikes, 'mismatch');
    expect(first.fire).toBe(false);
    strikes = first.strikes;
    const second = evaluateStrike(strikes, 'mismatch');
    expect(second.fire).toBe(true);
  });
});
