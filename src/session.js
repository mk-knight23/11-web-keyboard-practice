/**
 * Test session state machine — start / keystroke handling / timer / reset.
 * Test end is delegated through setTestEndHandler (wired to results.endTest
 * by main.js) so this module has no dependency on the results flow.
 */
import { el, showMessage, displayWord } from './ui.js';
import { getNextText } from './content.js';
import { track } from './analytics.js';
import {
  calculateRawWpm,
  calculateNetWpm,
  calculateAccuracy,
} from './lib/typing-metrics.js';

/** Words to complete before an untimed word-mode test ends. */
export const WORD_MODE_TARGET = 20;

export const state = {
  isRunning: false,
  currentWord: '',
  difficulty: 'medium',
  mode: 'word',
  codeLanguage: 'javascript',
  timerDuration: 60,
  timeLeft: 60,
  startTime: null,
  timerInterval: null,
  wordsTyped: 0,
  correctChars: 0,
  totalChars: 0,
  errors: 0,
  /** @type {Array<{ key: string, correct: boolean }>} */
  keystrokes: [],
  prevTypedLength: 0,
  /** Furthest input length reached for the current text (metrics v2). */
  maxTypedLength: 0,
};

let onTestEnd = () => {};

/** Wire the end-of-test flow (results.endTest). */
export function setTestEndHandler(fn) {
  onTestEnd = fn;
}

/** Provider for the next text to type — swappable for practice modes. */
let nextTextProvider = () =>
  getNextText({
    mode: state.mode,
    difficulty: state.difficulty,
    codeLanguage: state.codeLanguage,
  });

export function setNextTextProvider(fn) {
  nextTextProvider = fn;
}

/* ============================================
   Pure keystroke transitions (unit tested)
   ============================================ */

/**
 * Per-input-event counter deltas — metrics v2 ("first-strike" scoring).
 *
 * Every position of the target is scored exactly once: on the first forward
 * keystroke that reaches it. Backspaces are correction events and count
 * nothing; retyping a position after a correction is not re-scored (so
 * type/backspace loops cannot farm WPM, and a corrected error keeps its
 * original error count). Typing past the end of the target scores each
 * overflow position as an error. Multi-char forward jumps (paste, IME
 * commit) score once per newly reached position.
 *
 * @param {string} typed current full input value
 * @param {string} target text the user is supposed to type
 * @param {number} maxTypedLength furthest input length reached so far
 * @returns {{ totalChars: number, correctChars: number, errors: number }}
 */
export function computeInputDelta(typed, target, maxTypedLength = 0) {
  const delta = { totalChars: 0, correctChars: 0, errors: 0 };
  // Backspace/deletion or retype of already-scored ground: nothing to score.
  if (typed.length <= maxTypedLength) return delta;
  for (let i = maxTypedLength; i < typed.length; i++) {
    delta.totalChars += 1;
    if (i < target.length && typed[i] === target[i]) {
      delta.correctChars += 1;
    } else {
      // Wrong char, or overflow past the passage end — both are errors.
      delta.errors += 1;
    }
  }
  return delta;
}

/**
 * Additive per-key record for the heatmap. Only forward keystrokes within
 * the target bounds produce a record — backspaces and overflow are ignored.
 * The record is keyed by the character the user was SUPPOSED to type.
 * @param {string} typed
 * @param {string} target
 * @param {number} prevTypedLength
 * @returns {{ key: string, correct: boolean } | null}
 */
export function extractKeystroke(typed, target, prevTypedLength) {
  if (typed.length <= prevTypedLength) return null;
  if (typed.length > target.length) return null;
  const i = typed.length - 1;
  return { key: target[i], correct: typed[i] === target[i] };
}

/* ============================================
   Session flow
   ============================================ */

export function startTest() {
  state.isRunning = true;
  state.currentWord = nextTextProvider();
  state.startTime = Date.now();
  state.wordsTyped = 0;
  state.correctChars = 0;
  state.totalChars = 0;
  state.errors = 0;
  state.keystrokes = [];
  state.prevTypedLength = 0;
  state.maxTypedLength = 0;

  // Style for code mode
  const isCode = state.mode === 'code';
  el.wordDisplay.classList.toggle('coding', isCode);
  el.wordInput.classList.toggle('coding', isCode);

  el.wordText.textContent = state.currentWord;
  el.wordInput.disabled = false;
  el.wordInput.value = '';
  el.wordInput.focus();

  el.startBtn.disabled = true;
  el.resetBtn.disabled = false;
  el.difficulty.disabled = true;

  el.wordDisplay.classList.remove('correct', 'incorrect');

  // Timer mode or code/quotes (always timed)
  if (isTimedMode(state.mode)) {
    state.timeLeft = state.timerDuration;
    el.timerDisplay.classList.add('show');
    el.timerValue.textContent = state.timeLeft;
    startTimer();
  }

  showMessage('Start typing! Good luck!', 'info');
  track('test_started', { mode: state.mode, difficulty: state.difficulty });
}

export function isTimedMode(mode) {
  return mode === 'time' || mode === 'code' || mode === 'quotes';
}

function startTimer() {
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    el.timerValue.textContent = state.timeLeft;
    if (state.timeLeft <= 10) el.timerDisplay.classList.add('warning');
    if (state.timeLeft <= 0) onTestEnd();
  }, 1000);
}

export function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  el.timerDisplay.classList.remove('show', 'warning');
}

export function handleInput() {
  const typed = el.wordInput.value;
  const target = state.currentWord;

  const delta = computeInputDelta(typed, target, state.maxTypedLength);
  state.totalChars += delta.totalChars;
  state.correctChars += delta.correctChars;
  state.errors += delta.errors;

  const keystroke = extractKeystroke(typed, target, state.prevTypedLength);
  if (keystroke) state.keystrokes.push(keystroke);
  state.prevTypedLength = typed.length;
  state.maxTypedLength = Math.max(state.maxTypedLength, typed.length);

  displayWord(typed, target);

  // Live stats update
  if (state.startTime) {
    const elapsedSec = (Date.now() - state.startTime) / 1000;
    if (elapsedSec / 60 > 0.01) {
      el.statWPM.textContent = calculateNetWpm(state.correctChars, elapsedSec);
      el.statRawWPM.textContent = calculateRawWpm(state.totalChars, elapsedSec);
      el.statAccuracy.textContent =
        state.totalChars > 0
          ? calculateAccuracy(state.correctChars, state.totalChars) + '%'
          : '100%';
    }
  }

  // Check word complete
  if (typed === target) {
    state.wordsTyped++;
    advanceToNextText();

    // In word mode (no timer), end after N words
    if (!isTimedMode(state.mode) && state.wordsTyped >= WORD_MODE_TARGET) {
      onTestEnd();
    }
  }
}

function advanceToNextText() {
  state.currentWord = nextTextProvider();
  el.wordInput.value = '';
  state.prevTypedLength = 0;
  state.maxTypedLength = 0;
  el.wordText.textContent = state.currentWord;
  displayWord('', state.currentWord);
}

/** Tab skips the current text without ending the test. */
export function handleWordInputKeydown(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    if (state.isRunning) {
      state.wordsTyped++;
      advanceToNextText();
    }
  }
}

export function resetGame() {
  state.isRunning = false;
  stopTimer();
  el.wordInput.disabled = true;
  el.wordInput.value = '';
  state.prevTypedLength = 0;
  state.maxTypedLength = 0;
  el.wordText.textContent = 'Press Start to begin';
  el.wordDisplay.classList.remove('correct', 'incorrect', 'coding');
  el.wordInput.classList.remove('coding');
  el.startBtn.disabled = false;
  el.resetBtn.disabled = true;
  el.difficulty.disabled = false;
  // Move focus out of the now-disabled typing input to a sane, enabled target
  // so keyboard focus is never stranded after an abort/reset (WCAG 2.1.2).
  if (el.startBtn && typeof el.startBtn.focus === 'function')
    el.startBtn.focus();
  showMessage('Game reset. Ready to start again!', 'info');
}
