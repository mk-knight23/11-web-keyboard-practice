import { describe, it, expect } from 'vitest';
import {
  computeInputDelta,
  extractKeystroke,
  isTimedMode,
  WORD_MODE_TARGET,
} from '../session.js';

describe('computeInputDelta — parity with original inline logic', () => {
  it('counts a correct char', () => {
    expect(computeInputDelta('c', 'cat')).toEqual({
      totalChars: 1,
      correctChars: 1,
      errors: 0,
    });
    expect(computeInputDelta('cat', 'cat')).toEqual({
      totalChars: 1,
      correctChars: 1,
      errors: 0,
    });
  });

  it('counts a wrong char as an error', () => {
    expect(computeInputDelta('x', 'cat')).toEqual({
      totalChars: 1,
      correctChars: 0,
      errors: 1,
    });
    expect(computeInputDelta('cx', 'cat')).toEqual({
      totalChars: 1,
      correctChars: 0,
      errors: 1,
    });
  });

  it('counts only totalChars when typed is longer than the target', () => {
    expect(computeInputDelta('cats', 'cat')).toEqual({
      totalChars: 1,
      correctChars: 0,
      errors: 0,
    });
  });

  it('preserves the original quirk: empty typed counts as correct', () => {
    // Original: typed[-1] === target[-1] → undefined === undefined → correct.
    expect(computeInputDelta('', 'cat')).toEqual({
      totalChars: 1,
      correctChars: 1,
      errors: 0,
    });
  });
});

describe('computeInputDelta v2 — corrections and overflow (metric integrity)', () => {
  const NO_DELTA = { totalChars: 0, correctChars: 0, errors: 0 };

  it('does not count a backspace as a typed or correct char', () => {
    // typed shrank from 3 chars to 2 — a correction event, not a keystroke.
    expect(computeInputDelta('ca', 'cat', 3)).toEqual(NO_DELTA);
  });

  it('does not count clearing the input as correct (kills the undefined === undefined quirk)', () => {
    expect(computeInputDelta('', 'cat', 1)).toEqual(NO_DELTA);
  });

  it('scores fresh forward positions exactly once', () => {
    expect(computeInputDelta('c', 'cat', 0)).toEqual({
      totalChars: 1,
      correctChars: 1,
      errors: 0,
    });
    expect(computeInputDelta('cx', 'cat', 1)).toEqual({
      totalChars: 1,
      correctChars: 0,
      errors: 1,
    });
  });

  it('does not re-score a retyped position after a correction (no WPM farming)', () => {
    // Position 0 was already scored before the backspace (maxTypedLength 1).
    expect(computeInputDelta('c', 'cat', 1)).toEqual(NO_DELTA);
  });

  it('keeps the original error when a wrong char is typed then corrected (no accuracy inflation)', () => {
    // Sequence: 'x' (wrong), backspace, 'c' (retype of the same position).
    const deltas = [
      computeInputDelta('x', 'cat', 0),
      computeInputDelta('', 'cat', 1),
      computeInputDelta('c', 'cat', 1),
    ];
    const sum = deltas.reduce(
      (acc, d) => ({
        totalChars: acc.totalChars + d.totalChars,
        correctChars: acc.correctChars + d.correctChars,
        errors: acc.errors + d.errors,
      }),
      { ...NO_DELTA }
    );
    expect(sum).toEqual({ totalChars: 1, correctChars: 0, errors: 1 });
  });

  it('counts overflow typing past the passage end as an error', () => {
    expect(computeInputDelta('cats', 'cat', 3)).toEqual({
      totalChars: 1,
      correctChars: 0,
      errors: 1,
    });
  });

  it('scores multi-char forward jumps (paste / IME commit) once per position', () => {
    expect(computeInputDelta('cat', 'cat', 0)).toEqual({
      totalChars: 3,
      correctChars: 3,
      errors: 0,
    });
    expect(computeInputDelta('cxt', 'cat', 0)).toEqual({
      totalChars: 3,
      correctChars: 2,
      errors: 1,
    });
  });
});

describe('extractKeystroke', () => {
  it('records a forward correct keystroke keyed by the target char', () => {
    expect(extractKeystroke('ca', 'cat', 1)).toEqual({
      key: 'a',
      correct: true,
    });
  });

  it('records a forward incorrect keystroke keyed by the target char', () => {
    expect(extractKeystroke('cx', 'cat', 1)).toEqual({
      key: 'a',
      correct: false,
    });
  });

  it('ignores backspaces', () => {
    expect(extractKeystroke('c', 'cat', 2)).toBeNull();
    expect(extractKeystroke('', 'cat', 1)).toBeNull();
  });

  it('ignores typing past the end of the target', () => {
    expect(extractKeystroke('cats', 'cat', 3)).toBeNull();
  });
});

describe('mode transitions', () => {
  it('time, code and quotes are timed; word is not', () => {
    expect(isTimedMode('time')).toBe(true);
    expect(isTimedMode('code')).toBe(true);
    expect(isTimedMode('quotes')).toBe(true);
    expect(isTimedMode('word')).toBe(false);
  });

  it('word mode target is 20 words, matching the original constant', () => {
    expect(WORD_MODE_TARGET).toBe(20);
  });
});
