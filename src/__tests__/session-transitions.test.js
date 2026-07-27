import { describe, it, expect } from 'vitest';
import {
  computeInputDelta,
  extractKeystroke,
  buildStrike,
  isTimedMode,
  WORD_MODE_TARGET,
} from '../session.js';

describe('computeInputDelta — single forward keystrokes (metrics v2)', () => {
  // These tests previously pinned the buggy legacy counting for parity with
  // the original inline script. Updated for metrics v2: the bug they pinned
  // (backspaces counted as correct chars) is now fixed — see the v2 describe
  // block below for the correction/overflow specification.
  it('counts a correct char', () => {
    expect(computeInputDelta('c', 'cat', 0)).toEqual({
      totalChars: 1,
      correctChars: 1,
      errors: 0,
    });
    expect(computeInputDelta('cat', 'cat', 2)).toEqual({
      totalChars: 1,
      correctChars: 1,
      errors: 0,
    });
  });

  it('counts a wrong char as an error', () => {
    expect(computeInputDelta('x', 'cat', 0)).toEqual({
      totalChars: 1,
      correctChars: 0,
      errors: 1,
    });
    expect(computeInputDelta('cx', 'cat', 1)).toEqual({
      totalChars: 1,
      correctChars: 0,
      errors: 1,
    });
  });

  it('counts typing past the target end as an error (was: uncounted accuracy sink)', () => {
    expect(computeInputDelta('cats', 'cat', 3)).toEqual({
      totalChars: 1,
      correctChars: 0,
      errors: 1,
    });
  });

  it('never counts an empty input as a correct char (was: undefined === undefined quirk)', () => {
    expect(computeInputDelta('', 'cat', 1)).toEqual({
      totalChars: 0,
      correctChars: 0,
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

describe('buildStrike — timestamped strike records (input pipeline v2)', () => {
  // A "strike" is one input event that reaches new positions of the target.
  // It mirrors computeInputDelta's first-strike semantics exactly: events
  // that score nothing (backspaces, retypes of corrected ground) produce no
  // strike, so the strike log is the timestamp side of the same scoring.

  it('records a single forward correct keystroke', () => {
    expect(buildStrike('c', 'cat', 0, 150, 0)).toEqual({
      t: 150,
      seg: 0,
      pos: 0,
      span: 1,
      keys: [{ key: 'c', correct: true }],
    });
  });

  it('records a single forward wrong keystroke', () => {
    expect(buildStrike('cx', 'cat', 1, 320, 2)).toEqual({
      t: 320,
      seg: 2,
      pos: 1,
      span: 1,
      keys: [{ key: 'a', correct: false }],
    });
  });

  it('returns null for backspaces and cleared input (correction events)', () => {
    expect(buildStrike('ca', 'cat', 3, 100, 0)).toBeNull();
    expect(buildStrike('', 'cat', 1, 100, 0)).toBeNull();
  });

  it('returns null for a retype of already-scored ground (no re-strike)', () => {
    expect(buildStrike('c', 'cat', 1, 100, 0)).toBeNull();
  });

  it('records a multi-char forward jump (paste / IME commit) as ONE strike', () => {
    expect(buildStrike('cat', 'cat', 0, 500, 0)).toEqual({
      t: 500,
      seg: 0,
      pos: 0,
      span: 3,
      keys: [
        { key: 'c', correct: true },
        { key: 'a', correct: true },
        { key: 't', correct: true },
      ],
    });
  });

  it('counts overflow positions in span but never keys them (no target char)', () => {
    expect(buildStrike('catzz', 'cat', 3, 900, 0)).toEqual({
      t: 900,
      seg: 0,
      pos: 3,
      span: 2,
      keys: [],
    });
  });

  it('keys a mixed jump only for in-target positions', () => {
    const strike = buildStrike('cats', 'cat', 2, 700, 1);
    expect(strike.span).toBe(2);
    expect(strike.keys).toEqual([{ key: 't', correct: true }]);
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
