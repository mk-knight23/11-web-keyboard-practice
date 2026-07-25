/**
 * End-of-test flow: compute the final summary via the pure metrics library,
 * persist stats + history, and show the results modal.
 */
import { el } from './ui.js';
import { track } from './analytics.js';
import { summarizeTest, METRICS_VERSION } from './lib/typing-metrics.js';
import {
  getStats,
  saveStats,
  addHistoryEntry,
  updateStatsDisplay,
  renderHistory,
} from './history.js';
import { state, stopTimer } from './session.js';
import { recordSessionPerKey, renderHeatmap } from './heatmap.js';
import { renderDashboard } from './dashboard.js';
import { activateFocusTrap, deactivateFocusTrap } from './lib/focus-trap.js';

/**
 * Open the results modal with full focus management (WCAG 2.4.3): move focus
 * onto the primary action and trap Tab within the dialog. The markup already
 * carries role="dialog" + aria-modal="true".
 */
export function showResultsModal() {
  el.resultsModal.classList.add('show');
  el.modalRestartBtn.focus();
  activateFocusTrap(el.resultsModal);
}

/** Close the results modal, release the trap, and return focus to Start. */
export function hideResultsModal() {
  deactivateFocusTrap();
  el.resultsModal.classList.remove('show');
  if (el.startBtn && typeof el.startBtn.focus === 'function') {
    el.startBtn.focus();
  }
}

export function endTest() {
  state.isRunning = false;
  stopTimer();

  const elapsedSec = (Date.now() - state.startTime) / 1000;
  const summary = summarizeTest({
    totalChars: state.totalChars,
    correctChars: state.correctChars,
    elapsedSec,
    errors: state.errors,
    keystrokes: state.keystrokes,
  });

  // Personal best check
  const stats = getStats();
  const isPersonalBest = summary.netWpm > stats.bestWPM;

  stats.tests++;
  if (isPersonalBest) stats.bestWPM = summary.netWpm;
  saveStats();

  // History entry — tagged with the metrics version that produced it so
  // v2 results are distinguishable from pre-fix (inflated) entries.
  addHistoryEntry({
    date: new Date().toISOString(),
    wpm: summary.netWpm,
    rawWPM: summary.rawWpm,
    accuracy: summary.accuracy,
    time: Math.round(elapsedSec),
    errors: state.errors,
    mode: state.mode,
    difficulty: state.difficulty,
    metricsVersion: METRICS_VERSION,
  });

  updateStatsDisplay();
  renderHistory();

  // Aggregate this session's per-key stats and refresh the visualizations.
  recordSessionPerKey(summary.perKey);
  renderHeatmap();
  renderDashboard();

  // Modal content
  el.modalWPM.textContent = summary.netWpm;
  el.modalRawWPM.textContent = summary.rawWpm;
  el.modalAccuracy.textContent = summary.accuracy + '%';
  el.modalErrors.textContent = state.errors;
  el.modalPersonalBest.classList.toggle('show', isPersonalBest);

  el.wordInput.disabled = true;
  el.startBtn.disabled = false;
  el.resetBtn.disabled = true;
  el.difficulty.disabled = false;

  // Show with focus management (focus Try Again, trap Tab, return focus on
  // close). Done after the buttons are re-enabled so focus lands correctly.
  showResultsModal();

  track('test_completed', {
    mode: state.mode,
    wpm: summary.netWpm,
    accuracy: summary.accuracy,
    difficulty: state.difficulty,
  });
  if (isPersonalBest) track('personal_best_achieved', { wpm: summary.netWpm });
}
