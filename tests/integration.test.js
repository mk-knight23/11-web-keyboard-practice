/**
 * Integration smoke test: boots the real index.html markup, imports the real
 * module graph (src/main.js), and exercises full typing sessions through DOM
 * events. Asserts end-of-test numbers against the ORIGINAL inline formulas
 * to prove behavior parity after the ES-module extraction.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// import.meta.url is not a file: URL under the jsdom environment — resolve
// from the project root (vitest runs with cwd at the repo root) instead.
const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
const bodyMarkup = html
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script[^>]*><\/script>/g, '');

async function bootApp() {
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  const session = await import('../src/session.js');
  await import('../src/main.js');
  return session;
}

/** Original inline endTest formulas (pre-refactor index.html). */
const oldNetWpm = (correctChars, timeMin) =>
  Math.round(correctChars / 5 / timeMin);
const oldRawWpm = (totalChars, timeMin) => Math.round(totalChars / 5 / timeMin);
const oldAccuracy = (correctChars, totalChars) =>
  totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 0;

const MS_PER_KEYSTROKE = 100;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Simulates one input event, advancing the clock and independently tracking
 * the counters with the metrics-v2 first-strike algorithm: every position is
 * scored once, on the first forward keystroke that reaches it; backspaces
 * and retypes count nothing; overflow past the target end is an error.
 */
function makeTyper(input, counters) {
  let maxTyped = 0;
  return function dispatchValue(value, target) {
    vi.advanceTimersByTime(MS_PER_KEYSTROKE);
    // Every dispatched event advances the clock, counted or not.
    counters.events = (counters.events ?? 0) + 1;
    input.value = value;
    if (value.length > maxTyped) {
      for (let i = maxTyped; i < value.length; i++) {
        counters.total++;
        if (i < target.length && value[i] === target[i]) counters.correct++;
        else counters.errors++;
      }
      maxTyped = value.length;
    }
    // Completing the word advances to the next text and resets the input.
    if (value === target) maxTyped = 0;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
}

describe('full app boot + word-mode session (parity with original)', () => {
  it('completes a 20-word test with identical WPM/accuracy numbers', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const counters = { total: 0, correct: 0, errors: 0 };
    const type = makeTyper(input, counters);

    document.getElementById('startBtn').click();
    expect(state.isRunning).toBe(true);
    expect(input.disabled).toBe(false);

    for (let w = 0; w < 20; w++) {
      const word = state.currentWord;
      for (let i = 1; i <= word.length; i++) {
        type(word.slice(0, i), word);
      }
    }

    // Test must have ended after the 20th word.
    expect(state.isRunning).toBe(false);
    const modal = document.getElementById('resultsModal');
    expect(modal.classList.contains('show')).toBe(true);

    const elapsedMin = (counters.events * MS_PER_KEYSTROKE) / 60000;
    expect(document.getElementById('modalWPM').textContent).toBe(
      String(oldNetWpm(counters.correct, elapsedMin))
    );
    expect(document.getElementById('modalRawWPM').textContent).toBe(
      String(oldRawWpm(counters.total, elapsedMin))
    );
    expect(document.getElementById('modalAccuracy').textContent).toBe(
      oldAccuracy(counters.correct, counters.total) + '%'
    );
    expect(document.getElementById('modalErrors').textContent).toBe('0');

    // Persistence went through the versioned storage layer.
    const storedHistory = JSON.parse(
      localStorage.getItem('typesprint:v1:history')
    );
    expect(storedHistory).toHaveLength(1);
    expect(storedHistory[0].wpm).toBe(oldNetWpm(counters.correct, elapsedMin));
    expect(storedHistory[0].mode).toBe('word');
    expect(storedHistory[0].metricsVersion).toBe(2);
    const storedStats = JSON.parse(localStorage.getItem('typesprint:v1:stats'));
    expect(storedStats.tests).toBe(1);
    expect(storedStats.bestWPM).toBe(oldNetWpm(counters.correct, elapsedMin));
    expect(storedStats.metricsVersion).toBe(2);

    // Every forward keystroke was recorded for the per-key stats.
    expect(state.keystrokes).toHaveLength(counters.total);
    expect(state.keystrokes.every((k) => k.correct)).toBe(true);
  });

  // Updated for metrics v2: this test previously pinned the buggy legacy
  // behavior (backspace counted as a correct char via undefined===undefined).
  it('tracks errors and backspaces with v2 counting (corrections never inflate stats)', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const counters = { total: 0, correct: 0, errors: 0 };
    const type = makeTyper(input, counters);

    document.getElementById('startBtn').click();

    // First word: one wrong first char, backspace, then type it correctly.
    // v2: the wrong char keeps its error; the backspace and the corrected
    // retype of position 0 count nothing.
    const first = state.currentWord;
    type('~', first); // wrong char → error (words never contain '~')
    type('', first); // backspace → correction event, counts nothing
    for (let i = 1; i <= first.length; i++) type(first.slice(0, i), first);

    // Remaining 19 words typed cleanly.
    for (let w = 0; w < 19; w++) {
      const word = state.currentWord;
      for (let i = 1; i <= word.length; i++) type(word.slice(0, i), word);
    }

    expect(state.isRunning).toBe(false);
    const elapsedMin = (counters.events * MS_PER_KEYSTROKE) / 60000;
    expect(counters.errors).toBe(1);
    expect(document.getElementById('modalErrors').textContent).toBe('1');
    expect(document.getElementById('modalWPM').textContent).toBe(
      String(oldNetWpm(counters.correct, elapsedMin))
    );
    expect(document.getElementById('modalAccuracy').textContent).toBe(
      oldAccuracy(counters.correct, counters.total) + '%'
    );

    // Backspace produced no keystroke record; wrong + correct chars did.
    expect(state.keystrokes.filter((k) => !k.correct)).toHaveLength(1);
  });

  it('ends a timed test automatically when the timer hits zero', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const counters = { total: 0, correct: 0, errors: 0 };
    const type = makeTyper(input, counters);

    // Switch to Timer mode via the real mode button.
    const timeBtn = document.querySelector('.btn-option[data-mode="time"]');
    timeBtn.click();
    expect(state.mode).toBe('time');
    expect(document.getElementById('timerGroup').style.display).toBe('flex');

    document.getElementById('startBtn').click();
    const word = state.currentWord;
    for (let i = 1; i <= Math.min(3, word.length); i++)
      type(word.slice(0, i), word);

    // Drain the remaining 60s of the countdown.
    vi.advanceTimersByTime(60000);

    expect(state.isRunning).toBe(false);
    expect(
      document.getElementById('resultsModal').classList.contains('show')
    ).toBe(true);
    expect(
      document.getElementById('timerDisplay').classList.contains('show')
    ).toBe(false);
  });
});

describe('metric integrity v2 — live session counting', () => {
  /** Raw dispatcher: sets the input value and fires an input event. */
  function makeDispatcher(input) {
    return function dispatch(value) {
      vi.advanceTimersByTime(MS_PER_KEYSTROKE);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
  }

  it('a type/backspace loop does not inflate totalChars, correctChars, or WPM', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const dispatch = makeDispatcher(input);

    document.getElementById('startBtn').click();
    const first = state.currentWord;

    // Farm the first (correct) char: type it, backspace it, ten times over.
    for (let n = 0; n < 10; n++) {
      dispatch(first.slice(0, 1));
      dispatch('');
    }
    dispatch(first.slice(0, 1));

    // The first position must have been scored exactly once.
    expect(state.totalChars).toBe(1);
    expect(state.correctChars).toBe(1);
    expect(state.errors).toBe(0);
  });

  it('a typed-then-corrected wrong char keeps its error and is not double-counted', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const dispatch = makeDispatcher(input);

    document.getElementById('startBtn').click();

    dispatch('~'); // guaranteed-wrong first char
    dispatch(''); // backspace
    dispatch(state.currentWord.slice(0, 1)); // corrected retype

    expect(state.totalChars).toBe(1);
    expect(state.correctChars).toBe(0);
    expect(state.errors).toBe(1);
  });

  it('overflow typing past the passage end increments the Errors stat', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const dispatch = makeDispatcher(input);

    document.getElementById('startBtn').click();
    const word = state.currentWord;

    // Type the whole word except its last char, then two overflow chars
    // beyond the passage end (word stays incomplete → no advance).
    const stem = word.slice(0, word.length - 1);
    for (let i = 1; i <= stem.length; i++) dispatch(stem.slice(0, i));
    dispatch(stem + '~'); // wrong final char (words never contain '~')
    dispatch(stem + '~z'); // overflow char past the passage end

    expect(state.errors).toBe(2); // 1 wrong final char + 1 overflow char
    expect(state.totalChars).toBe(word.length + 1);
  });
});

describe('storage write failure surfacing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a non-blocking notice when results can't be persisted (quota exceeded)", async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const counters = { total: 0, correct: 0, errors: 0 };
    const type = makeTyper(input, counters);
    document.getElementById('startBtn').click();

    // Storage fills up mid-test: every subsequent write throws.
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    for (let w = 0; w < 20; w++) {
      const word = state.currentWord;
      for (let i = 1; i <= word.length; i++) type(word.slice(0, i), word);
    }

    // The flow completed anyway — the failure is non-blocking.
    expect(state.isRunning).toBe(false);
    expect(
      document.getElementById('resultsModal').classList.contains('show')
    ).toBe(true);

    // And the user was told their results were not saved.
    const message = document.getElementById('message');
    expect(message.textContent).toBe(
      "Results couldn't be saved — storage may be full"
    );
    expect(message.className).toContain('error');
  });

  it('shows a notice when the theme preference cannot be persisted', async () => {
    // V3: the sun/moon toggle became a 3-option switcher (light/dark/hc)
    // persisting to the mk.typesprint.theme.v1 family key.
    await bootApp();
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    document.querySelector('[data-set-theme="light"]').click();

    // The switch still applied visually (non-blocking)…
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    // …but the user was told it will not survive a reload.
    expect(document.getElementById('message').textContent).toBe(
      "Theme preference couldn't be saved — storage may be full"
    );
  });
});

describe('IME composition guard (metrics v2)', () => {
  function setValueAndInput(input, value) {
    vi.advanceTimersByTime(MS_PER_KEYSTROKE);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('ignores intermediate composition updates and scores the committed string once', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    document.getElementById('startBtn').click();

    input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    // Intermediate composition updates fire input events with provisional text.
    setValueAndInput(input, 'ち');
    setValueAndInput(input, 'ちゃ');
    expect(state.totalChars).toBe(0);
    expect(state.correctChars).toBe(0);
    expect(state.errors).toBe(0);

    // Commit: the provisional text is replaced by the committed string.
    const committed = state.currentWord.slice(0, 2);
    vi.advanceTimersByTime(MS_PER_KEYSTROKE);
    input.value = committed;
    input.dispatchEvent(new Event('compositionend', { bubbles: true }));

    expect(state.totalChars).toBe(committed.length);
    expect(state.correctChars).toBe(committed.length);
    expect(state.errors).toBe(0);
  });

  it('a trailing input event after compositionend cannot double-count (browser ordering)', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    document.getElementById('startBtn').click();

    input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    setValueAndInput(input, 'ち');
    const committed = state.currentWord.slice(0, 2);
    vi.advanceTimersByTime(MS_PER_KEYSTROKE);
    input.value = committed;
    input.dispatchEvent(new Event('compositionend', { bubbles: true }));
    // Safari fires the final input event AFTER compositionend.
    setValueAndInput(input, committed);

    expect(state.totalChars).toBe(committed.length);
    expect(state.correctChars).toBe(committed.length);
  });

  it('a composition that commits the whole word completes the word', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    document.getElementById('startBtn').click();
    const word = state.currentWord;

    input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    setValueAndInput(input, 'ち');
    vi.advanceTimersByTime(MS_PER_KEYSTROKE);
    input.value = word;
    input.dispatchEvent(new Event('compositionend', { bubbles: true }));

    expect(state.wordsTyped).toBe(1);
    expect(state.totalChars).toBe(word.length);
    expect(state.correctChars).toBe(word.length);
    expect(input.value).toBe(''); // advanced to the next text
  });
});

describe('input pipeline v2 — timestamped strike log (wave 3)', () => {
  function makeDispatcher(input) {
    return function dispatch(value) {
      vi.advanceTimersByTime(MS_PER_KEYSTROKE);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
  }

  it('records one timestamped strike per scored keystroke', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const dispatch = makeDispatcher(input);

    document.getElementById('startBtn').click();
    const word = state.currentWord;
    for (let i = 1; i <= 3; i++) dispatch(word.slice(0, i));

    expect(state.strikes).toHaveLength(3);
    // Fake timers advance exactly 100ms per dispatch.
    expect(state.strikes.map((s) => s.t)).toEqual([100, 200, 300]);
    expect(state.strikes.map((s) => s.pos)).toEqual([0, 1, 2]);
    expect(state.strikes.every((s) => s.span === 1)).toBe(true);
    expect(state.strikes.every((s) => s.seg === 0)).toBe(true);
    expect(state.strikes[0].keys).toEqual([{ key: word[0], correct: true }]);
  });

  it('backspaces and corrected retypes produce no strike (mirrors scoring)', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const dispatch = makeDispatcher(input);

    document.getElementById('startBtn').click();
    dispatch('~'); // wrong char → strike
    dispatch(''); // backspace → no strike
    dispatch(state.currentWord.slice(0, 1)); // retype → no strike

    expect(state.strikes).toHaveLength(1);
    expect(state.strikes[0].keys[0].correct).toBe(false);
  });

  it('advancing to the next word bumps the strike segment', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const dispatch = makeDispatcher(input);

    document.getElementById('startBtn').click();
    const first = state.currentWord;
    for (let i = 1; i <= first.length; i++) dispatch(first.slice(0, i));
    const second = state.currentWord;
    dispatch(second.slice(0, 1));

    const segs = state.strikes.map((s) => s.seg);
    expect(segs.slice(0, first.length).every((s) => s === 0)).toBe(true);
    expect(segs[segs.length - 1]).toBe(1);
    // The new word restarts positions from 0.
    expect(state.strikes[state.strikes.length - 1].pos).toBe(0);
  });

  it('an IME commit is ONE strike spanning the committed string, stamped at commit time', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    document.getElementById('startBtn').click();

    input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    // Provisional composition updates: no strikes, no timestamps.
    vi.advanceTimersByTime(MS_PER_KEYSTROKE);
    input.value = 'ち';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(MS_PER_KEYSTROKE);
    input.value = 'ちゃ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(state.strikes).toHaveLength(0);

    const committed = state.currentWord.slice(0, 2);
    vi.advanceTimersByTime(MS_PER_KEYSTROKE);
    input.value = committed;
    input.dispatchEvent(new Event('compositionend', { bubbles: true }));

    expect(state.strikes).toHaveLength(1);
    expect(state.strikes[0]).toMatchObject({ t: 300, pos: 0, span: 2 });
    expect(state.strikes[0].keys).toHaveLength(2);
  });

  it('a trailing input event after compositionend adds no extra strike (Safari ordering)', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const dispatch = makeDispatcher(input);
    document.getElementById('startBtn').click();

    input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    dispatch('ち');
    const committed = state.currentWord.slice(0, 2);
    vi.advanceTimersByTime(MS_PER_KEYSTROKE);
    input.value = committed;
    input.dispatchEvent(new Event('compositionend', { bubbles: true }));
    dispatch(committed); // Safari fires input AFTER compositionend

    expect(state.strikes).toHaveLength(1);
  });

  it('dead-key composition scores and stamps the composed char exactly once', async () => {
    // macOS/modern browsers: a dead key (e.g. Option+e) opens a composition
    // with a provisional accent, then commits the composed character.
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    document.getElementById('startBtn').click();

    input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    vi.advanceTimersByTime(MS_PER_KEYSTROKE);
    input.value = '´'; // provisional dead-key accent
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(state.totalChars).toBe(0);
    expect(state.strikes).toHaveLength(0);

    const committed = state.currentWord.slice(0, 1);
    vi.advanceTimersByTime(MS_PER_KEYSTROKE);
    input.value = committed;
    input.dispatchEvent(new Event('compositionend', { bubbles: true }));

    expect(state.totalChars).toBe(1);
    expect(state.correctChars).toBe(1);
    expect(state.strikes).toHaveLength(1);
    expect(state.strikes[0]).toMatchObject({ t: 200, pos: 0, span: 1 });
  });

  it('a legacy dead-key same-length replacement neither re-scores nor re-strikes', async () => {
    // Older engines without composition events insert the accent then
    // REPLACE it in place ('´' → 'é'): same input length, first-strike
    // ground already scored — the replacement must count nothing.
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const dispatch = makeDispatcher(input);
    document.getElementById('startBtn').click();

    dispatch('´'); // accent lands as a (wrong) scored strike
    expect(state.totalChars).toBe(1);
    expect(state.strikes).toHaveLength(1);

    dispatch('é'); // in-place replacement: same length, no new ground
    expect(state.totalChars).toBe(1);
    expect(state.errors).toBe(1);
    expect(state.strikes).toHaveLength(1);
  });

  it('reset clears the strike log', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const dispatch = makeDispatcher(input);
    document.getElementById('startBtn').click();
    dispatch(state.currentWord.slice(0, 1));
    expect(state.strikes).toHaveLength(1);

    document.getElementById('resetBtn').click();
    expect(state.strikes).toHaveLength(0);
    expect(state.strikeSegment).toBe(0);
  });
});

describe('latency aggregation persistence (wave 3 — data layer)', () => {
  it('persists per-key and bigram latency aggregates after a session', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const counters = { total: 0, correct: 0, errors: 0 };
    const type = makeTyper(input, counters);

    document.getElementById('startBtn').click();
    for (let w = 0; w < 20; w++) {
      const word = state.currentWord;
      for (let i = 1; i <= word.length; i++) type(word.slice(0, i), word);
    }
    expect(state.isRunning).toBe(false);

    const keyLatency = JSON.parse(
      localStorage.getItem('typesprint:v1:keyLatency')
    );
    expect(keyLatency).toBeTruthy();
    // Fake timers: every attributable interval is exactly 100ms.
    for (const stat of Object.values(keyLatency)) {
      expect(stat.totalMs / stat.count).toBe(100);
    }

    const bigramLatency = JSON.parse(
      localStorage.getItem('typesprint:v1:bigramLatency')
    );
    expect(bigramLatency).toBeTruthy();
    const bigrams = Object.keys(bigramLatency);
    expect(bigrams.length).toBeGreaterThan(0);
    expect(bigrams.every((b) => b.length === 2)).toBe(true);
  });
});

describe('consistency metric display (wave 3)', () => {
  it('shows the consistency score in the results modal and stores it on the entry', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const counters = { total: 0, correct: 0, errors: 0 };
    const type = makeTyper(input, counters);

    document.getElementById('startBtn').click();
    for (let w = 0; w < 20; w++) {
      const word = state.currentWord;
      for (let i = 1; i <= word.length; i++) type(word.slice(0, i), word);
    }
    expect(state.isRunning).toBe(false);

    // Fake timers advance exactly 100ms per keystroke: a metronome-steady
    // rhythm scores a perfect 100.
    expect(document.getElementById('modalConsistency').textContent).toBe(
      '100%'
    );
    const stored = JSON.parse(localStorage.getItem('typesprint:v1:history'));
    expect(stored[0].consistency).toBe(100);
    // And the history list renders the score.
    expect(document.getElementById('historyList').textContent).toContain(
      '100%'
    );
  });

  it('shows an em dash when the sample is too small for a score', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const counters = { total: 0, correct: 0, errors: 0 };
    const type = makeTyper(input, counters);

    // Timed mode, only 3 keystrokes → 2 intervals → below min-sample.
    document.querySelector('.btn-option[data-mode="time"]').click();
    document.getElementById('startBtn').click();
    const word = state.currentWord;
    for (let i = 1; i <= Math.min(3, word.length); i++)
      type(word.slice(0, i), word);
    vi.advanceTimersByTime(60000);

    expect(state.isRunning).toBe(false);
    expect(document.getElementById('modalConsistency').textContent).toBe('—');
    const stored = JSON.parse(localStorage.getItem('typesprint:v1:history'));
    expect(stored[0].consistency).toBeUndefined();
  });

  it('renders pre-Wave-3 history entries (no consistency field) as an em dash', async () => {
    localStorage.setItem(
      'typesprint:v1:history',
      JSON.stringify([
        {
          date: '2026-07-01T10:00:00.000Z',
          wpm: 64,
          rawWPM: 70,
          accuracy: 91,
          time: 60,
          errors: 6,
          mode: 'word',
          difficulty: 'medium',
        },
      ])
    );
    await bootApp();
    const items = document.querySelectorAll(
      '#historyList .history-item:not(:first-child)'
    );
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('—');
  });
});

describe('results modal focus management (a11y wave-2)', () => {
  async function completeWordTest() {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const counters = { total: 0, correct: 0, errors: 0 };
    const type = makeTyper(input, counters);
    document.getElementById('startBtn').click();
    for (let w = 0; w < 20; w++) {
      const word = state.currentWord;
      for (let i = 1; i <= word.length; i++) type(word.slice(0, i), word);
    }
    return state;
  }

  it('focuses Try Again on open and returns focus to Start on Escape', async () => {
    await completeWordTest();
    const modal = document.getElementById('resultsModal');
    expect(modal.classList.contains('show')).toBe(true);
    expect(document.activeElement).toBe(
      document.getElementById('modalRestartBtn')
    );

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(modal.classList.contains('show')).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('startBtn'));
  });

  it('traps Tab focus within the dialog', async () => {
    await completeWordTest();
    const closeBtn = document.getElementById('modalCloseBtn');
    const restartBtn = document.getElementById('modalRestartBtn');

    // Focus starts on Try Again (the last focusable). Tab wraps to the first.
    expect(document.activeElement).toBe(restartBtn);
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab off the first focusable wraps back to the last.
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(restartBtn);
  });
});

describe('keyboard accessibility guards (a11y wave-2)', () => {
  it('Space starts a test only when focus is on the body, not on a control', async () => {
    const { state } = await bootApp();

    // Focus a control (a theme-switch button — V3 replaced the old sun/moon
    // toggle with the 3-option switcher): Space must NOT hijack activation.
    const themeButton = document.querySelector('[data-set-theme="light"]');
    themeButton.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(state.isRunning).toBe(false);

    // Focus on body (nothing interactive focused): Space starts the test.
    themeButton.blur();
    expect(document.activeElement).toBe(document.body);
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(state.isRunning).toBe(true);
  });

  it('Escape aborts a running test and returns focus to the Start button', async () => {
    const { state } = await bootApp();

    document.getElementById('startBtn').click();
    expect(state.isRunning).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('wordInput'));

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(state.isRunning).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('startBtn'));
  });
});

describe('boot-time migration and rendering', () => {
  it('migrates legacy typingHistory/typingStats/theme and renders them', async () => {
    const legacyEntry = {
      date: '2026-07-01T10:00:00.000Z',
      wpm: 64,
      rawWPM: 70,
      accuracy: 91,
      time: 60,
      errors: 6,
      mode: 'word',
      difficulty: 'medium',
    };
    localStorage.setItem('typingHistory', JSON.stringify([legacyEntry]));
    localStorage.setItem(
      'typingStats',
      JSON.stringify({ tests: 7, bestWPM: 64 })
    );
    localStorage.setItem('theme', 'dark');

    await bootApp();

    // Namespaced copies exist. Pre-v2 bestWPM is archived (metrics v2):
    // the legacy value was measured with inflated counting, so it is kept
    // as legacyBestWPM and the active personal best restarts fresh.
    expect(JSON.parse(localStorage.getItem('typesprint:v1:history'))).toEqual([
      legacyEntry,
    ]);
    expect(JSON.parse(localStorage.getItem('typesprint:v1:stats'))).toEqual({
      tests: 7,
      bestWPM: 0,
      legacyBestWPM: 64,
      metricsVersion: 2,
    });
    expect(JSON.parse(localStorage.getItem('typesprint:v1:theme'))).toBe(
      'dark'
    );

    // And they drive the UI: stats panel, history list, theme attribute.
    expect(document.getElementById('statTests').textContent).toBe('7');
    expect(document.getElementById('statBest').textContent).toBe('0');
    expect(
      document.getElementById('historySection').classList.contains('show')
    ).toBe(true);
    expect(document.getElementById('historyList').innerHTML).toContain(
      '<strong>64</strong>'
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('theme switcher applies and persists under the mk family key', async () => {
    // V3: signature default is dark (Deep Focus) — no system-preference
    // fallback — and the choice persists as a raw string under
    // mk.typesprint.theme.v1 (family spec) instead of typesprint:v1:theme.
    await bootApp();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    document.querySelector('[data-set-theme="light"]').click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('mk.typesprint.theme.v1')).toBe('light');

    document.querySelector('[data-set-theme="hc"]').click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('hc');
    expect(localStorage.getItem('mk.typesprint.theme.v1')).toBe('hc');
    expect(
      document
        .querySelector('[data-set-theme="hc"]')
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      document
        .querySelector('[data-set-theme="light"]')
        .getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('migrates a pre-V3 mk-less theme to the family key on boot', async () => {
    localStorage.setItem('typesprint:v1:theme', JSON.stringify('light'));
    await bootApp();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('mk.typesprint.theme.v1')).toBe('light');
  });
});

describe('V3 display preferences (motion / transparency)', () => {
  it('reduce-motion toggle stamps data-motion and persists', async () => {
    await bootApp();
    expect(document.documentElement.getAttribute('data-motion')).toBe('full');

    document.getElementById('motionToggle').click();
    expect(document.documentElement.getAttribute('data-motion')).toBe(
      'reduced'
    );
    expect(localStorage.getItem('mk.typesprint.motion.v1')).toBe('reduced');
    expect(
      document.getElementById('motionToggle').getAttribute('aria-pressed')
    ).toBe('true');

    document.getElementById('motionToggle').click();
    expect(document.documentElement.getAttribute('data-motion')).toBe('full');
  });

  it('reduce-glass toggle stamps data-transparency and persists', async () => {
    await bootApp();
    expect(document.documentElement.getAttribute('data-transparency')).toBe(
      'normal'
    );

    document.getElementById('transparencyToggle').click();
    expect(document.documentElement.getAttribute('data-transparency')).toBe(
      'reduced'
    );
    expect(localStorage.getItem('mk.typesprint.transparency.v1')).toBe(
      'reduced'
    );
  });
});

describe('zen mode (data-focus)', () => {
  it('toggle button and exit chip drive data-focus and focus management', async () => {
    await bootApp();
    expect(document.documentElement.getAttribute('data-focus')).toBe('normal');

    document.getElementById('zenToggle').click();
    expect(document.documentElement.getAttribute('data-focus')).toBe('zen');
    expect(
      document.getElementById('zenToggle').getAttribute('aria-pressed')
    ).toBe('true');
    // Focus lands on the exit chip — the only visible control.
    expect(document.activeElement).toBe(document.getElementById('zenExit'));

    document.getElementById('zenExit').click();
    expect(document.documentElement.getAttribute('data-focus')).toBe('normal');
    expect(document.activeElement).toBe(document.getElementById('zenToggle'));
  });

  it('Z toggles zen only when focus is not on an editable target', async () => {
    await bootApp();

    // Focus on body: Z enters zen.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', bubbles: true })
    );
    expect(document.documentElement.getAttribute('data-focus')).toBe('zen');

    // Inside the typing input, "z" is just a letter — never a toggle.
    const { state } = await import('../src/session.js');
    document.getElementById('startBtn').click();
    expect(state.isRunning).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('wordInput'));
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', bubbles: true })
    );
    expect(document.documentElement.getAttribute('data-focus')).toBe('zen');
  });

  it('Escape exits zen last in the priority chain (after aborting a test)', async () => {
    const { state } = await bootApp();
    document.getElementById('zenToggle').click();
    expect(document.documentElement.getAttribute('data-focus')).toBe('zen');

    document.getElementById('startBtn').click();
    expect(state.isRunning).toBe(true);

    // First Escape aborts the running test but stays in zen…
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(state.isRunning).toBe(false);
    expect(document.documentElement.getAttribute('data-focus')).toBe('zen');

    // …the second Escape exits zen.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(document.documentElement.getAttribute('data-focus')).toBe('normal');
  });
});

describe('collapsible nav menu (mobile dead-end fix)', () => {
  it('menu button toggles the nav menu open and closed', async () => {
    await bootApp();
    const toggle = document.getElementById('navMenuToggle');
    const menu = document.getElementById('navMenu');

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(menu.classList.contains('open')).toBe(true);

    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(menu.classList.contains('open')).toBe(false);
  });

  it('growth pages are reachable from the nav menu', async () => {
    await bootApp();
    const menu = document.getElementById('navMenu');
    for (const href of [
      '/typing-test',
      '/typing-accuracy-test',
      '/code-typing-practice',
      '/python-typing-practice',
      '/javascript-typing-practice',
      '/average-typing-speed',
      '/how-to-type-faster',
    ]) {
      expect(menu.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });
});

describe('keyboard heatmap (feature 2)', () => {
  it('aggregates per-key data after a session and colors the grid', async () => {
    const { state } = await bootApp();
    const input = document.getElementById('wordInput');
    const counters = { total: 0, correct: 0, errors: 0 };
    const type = makeTyper(input, counters);

    document.getElementById('startBtn').click();
    for (let w = 0; w < 20; w++) {
      const word = state.currentWord;
      for (let i = 1; i <= word.length; i++) type(word.slice(0, i), word);
    }

    const stored = JSON.parse(localStorage.getItem('typesprint:v1:perKey'));
    expect(stored).toBeTruthy();
    expect(Object.keys(stored).length).toBeGreaterThan(0);
    // Every recorded key was typed correctly in this clean run.
    for (const stat of Object.values(stored)) {
      expect(stat.accuracy).toBe(100);
      expect(stat.misses).toBe(0);
    }

    // The rendered grid has colored keys with count tooltips.
    const colored = document.querySelectorAll(
      '#keyboardHeatmap .heatmap-key:not(.heatmap-empty)'
    );
    expect(colored.length).toBeGreaterThan(0);
    expect(colored[0].getAttribute('title')).toMatch(
      /% accuracy \(\d+ hit \/ \d+ miss\)/
    );
    expect(colored[0].getAttribute('style')).toContain('hsl');
  });
});

describe('weak-key practice mode (feature 3)', () => {
  it('explains the recommendation and serves words containing weak keys', async () => {
    // Seed an aggregate where q and z are clearly weakest.
    const seed = {};
    for (const k of 'aeionrst')
      seed[k] = { hits: 20, misses: 0, total: 20, accuracy: 100 };
    seed.q = { hits: 1, misses: 9, total: 10, accuracy: 10 };
    seed.z = { hits: 2, misses: 8, total: 10, accuracy: 20 };
    localStorage.setItem('typesprint:v1:perKey', JSON.stringify(seed));

    const { state } = await bootApp();
    document.querySelector('.btn-option[data-mode="weak"]').click();
    expect(state.mode).toBe('weak');
    expect(document.getElementById('weakKeyInfo').textContent).toContain(
      'Practicing: q, z'
    );

    document.getElementById('startBtn').click();
    expect(state.isRunning).toBe(true);
    // Draw a batch of practice words: most must contain a weak key.
    const words = [];
    for (let i = 0; i < 40; i++) {
      words.push(state.currentWord);
      const e = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      document.getElementById('wordInput').dispatchEvent(e); // Tab-skip to next word
    }
    const weakRate =
      words.filter((w) => w.includes('q') || w.includes('z')).length /
      words.length;
    expect(weakRate).toBeGreaterThan(0.4);
  });

  it('falls back to regular words and says so when data is insufficient', async () => {
    const { state } = await bootApp();
    document.querySelector('.btn-option[data-mode="weak"]').click();
    expect(document.getElementById('weakKeyInfo').textContent).toContain(
      'Not enough per-key data'
    );

    document.getElementById('startBtn').click();
    expect(typeof state.currentWord).toBe('string');
    expect(state.currentWord.length).toBeGreaterThan(0);
  });

  it('respects the disable toggle', async () => {
    localStorage.setItem(
      'typesprint:v1:perKey',
      JSON.stringify({ q: { hits: 0, misses: 10, total: 10, accuracy: 0 } })
    );
    await bootApp();
    document.querySelector('.btn-option[data-mode="weak"]').click();
    const toggle = document.getElementById('weakKeyToggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.getElementById('weakKeyInfo').textContent).toContain(
      'targeting is off'
    );
  });
});

describe('data controls (feature 4)', () => {
  it('delete-all wipes namespaced and legacy keys after confirm', async () => {
    localStorage.setItem('typingHistory', JSON.stringify([{ wpm: 50 }]));
    localStorage.setItem(
      'typingStats',
      JSON.stringify({ tests: 2, bestWPM: 50 })
    );
    await bootApp(); // migration populates typesprint:v1:* keys
    expect(localStorage.getItem('typesprint:v1:history')).not.toBeNull();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.getElementById('deleteAllDataBtn').click();

    expect(localStorage.getItem('typesprint:v1:history')).toBeNull();
    expect(localStorage.getItem('typesprint:v1:stats')).toBeNull();
    expect(localStorage.getItem('typingHistory')).toBeNull();
    expect(localStorage.getItem('typingStats')).toBeNull();
    expect(document.getElementById('statTests').textContent).toBe('0');
    expect(document.getElementById('statBest').textContent).toBe('0');
  });

  it('delete-all is a no-op when the confirm is declined', async () => {
    localStorage.setItem('typingHistory', JSON.stringify([{ wpm: 50 }]));
    await bootApp();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    document.getElementById('deleteAllDataBtn').click();
    expect(localStorage.getItem('typesprint:v1:history')).not.toBeNull();
  });
});

describe('progress dashboard (feature 5)', () => {
  it('renders records, practice minutes, and a WPM sparkline from real history', async () => {
    const mkEntry = (wpm, accuracy, time) => ({
      date: '2026-07-10T10:00:00.000Z',
      wpm,
      rawWPM: wpm + 4,
      accuracy,
      time,
      errors: 2,
      mode: 'word',
      difficulty: 'medium',
    });
    localStorage.setItem(
      'typingHistory',
      JSON.stringify([
        mkEntry(70, 96, 60),
        mkEntry(65, 92, 90),
        mkEntry(60, 90, 30),
      ])
    );
    localStorage.setItem(
      'typingStats',
      JSON.stringify({ tests: 3, bestWPM: 70 })
    );

    await bootApp();

    const dash = document.getElementById('progressDashboard');
    expect(dash.classList.contains('show')).toBe(true);
    expect(
      dash.querySelector('svg.spark polyline').getAttribute('points')
    ).toBeTruthy();
    const values = [...dash.querySelectorAll('.dash-value')].map(
      (n) => n.textContent
    );
    // Best WPM is the ACTIVE personal best: the seeded stats are pre-v2, so
    // the inflated 70 is archived as legacyBestWPM and the active best is 0
    // until a metrics-v2 result lands (see docs/v3/METRICS_V2.md).
    expect(values).toEqual(['0', '96%', '3', '3']); // best WPM, best acc, tests, minutes
  });
});
