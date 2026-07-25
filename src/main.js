/**
 * App orchestrator — wires DOM events to the session, results, history,
 * and theme modules. This is the only module with top-level side effects.
 */
import { initElements, el, showSection } from './ui.js';
import { initTheme, toggleTheme } from './theme.js';
import {
  state,
  startTest,
  resetGame,
  handleInput,
  handleWordInputKeydown,
  handleCompositionStart,
  handleCompositionEnd,
  setTestEndHandler,
  setNextTextProvider,
  isTimedMode,
} from './session.js';
import { getNextText } from './content.js';
import { shouldStartOnSpace, shouldAbortOnEscape } from './keyboard.js';
import { getWeakPracticeWord, updateWeakKeyExplainer } from './practice.js';
import { renderHeatmap } from './heatmap.js';
import { renderDashboard } from './dashboard.js';
import { initDataControls } from './data-controls.js';
import { endTest, hideResultsModal } from './results.js';
import {
  migrateLegacyData,
  loadPersistedData,
  updateStatsDisplay,
  renderHistory,
  deleteHistoryItem,
  clearHistory,
} from './history.js';
import { track } from './analytics.js';

/* ============================================
   Bootstrap
   ============================================ */
initElements();
migrateLegacyData();
loadPersistedData();
setTestEndHandler(endTest);

// Text provider: weak-key practice mode gets biased words; everything else
// keeps the original word/timer/code/quotes routing.
setNextTextProvider(() =>
  state.mode === 'weak'
    ? getWeakPracticeWord(state.difficulty)
    : getNextText({
        mode: state.mode,
        difficulty: state.difficulty,
        codeLanguage: state.codeLanguage,
      })
);

// Inline onclick handlers in the markup rely on these globals.
window.showSection = showSection;
window.deleteHistoryItem = (i) => {
  deleteHistoryItem(i);
  renderDashboard();
};

/* ============================================
   Event Listeners
   ============================================ */
el.themeToggle.addEventListener('click', toggleTheme);
el.difficulty.addEventListener('change', (e) => {
  state.difficulty = e.target.value;
});

el.modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    el.modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;

    el.timerGroup.style.display = isTimedMode(state.mode) ? 'flex' : 'none';
    el.codeLanguageGroup.style.display =
      state.mode === 'code' ? 'flex' : 'none';

    // Weak-key practice controls
    const isWeak = state.mode === 'weak';
    if (el.weakKeyGroup)
      el.weakKeyGroup.style.display = isWeak ? 'flex' : 'none';
    if (el.weakKeyInfo)
      el.weakKeyInfo.style.display = isWeak ? 'block' : 'none';
    if (isWeak) updateWeakKeyExplainer();

    track('mode_changed', { mode: state.mode });
  });
});

if (el.weakKeyToggle) {
  el.weakKeyToggle.addEventListener('change', () => {
    updateWeakKeyExplainer();
    track('weak_key_toggle', { enabled: el.weakKeyToggle.checked });
  });
}

el.codeLanguage.addEventListener('change', (e) => {
  state.codeLanguage = e.target.value;
});
el.timerDuration.addEventListener('change', (e) => {
  state.timerDuration = parseInt(e.target.value);
});

el.startBtn.addEventListener('click', startTest);
el.resetBtn.addEventListener('click', resetGame);
el.wordInput.addEventListener('input', handleInput);
el.wordInput.addEventListener('keydown', handleWordInputKeydown);
// IME guard: intermediate composition input is provisional; the committed
// string is counted once on compositionend (metrics v2).
el.wordInput.addEventListener('compositionstart', handleCompositionStart);
el.wordInput.addEventListener('compositionend', handleCompositionEnd);

el.historyBtn.addEventListener('click', () => {
  renderHistory();
  el.historySection.classList.toggle('show');
});

el.clearHistoryBtn.addEventListener('click', () => {
  clearHistory();
  renderDashboard();
});
el.modalCloseBtn.addEventListener('click', () => hideResultsModal());
el.modalRestartBtn.addEventListener('click', () => {
  hideResultsModal();
  startTest();
});
el.resultsModal.addEventListener('click', (e) => {
  if (e.target === el.resultsModal) hideResultsModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Priority 1: close the results modal if it is open.
    if (el.resultsModal.classList.contains('show')) {
      hideResultsModal();
      return;
    }
    // Priority 2: abort a running test so keyboard users are never trapped
    // inside the typing input (WCAG 2.1.2).
    if (shouldAbortOnEscape(e.key, state.isRunning)) {
      resetGame();
      return;
    }
  }
  // Space starts a test only when no control/input is focused (WCAG 2.1.1).
  if (
    shouldStartOnSpace({
      key: e.key,
      activeElement: document.activeElement,
      body: document.body,
      startDisabled: el.startBtn.disabled,
    })
  ) {
    e.preventDefault();
    startTest();
  }
});

/* ============================================
   Init
   ============================================ */
initDataControls();
initTheme();
updateStatsDisplay();
renderHistory();
renderHeatmap();
renderDashboard();
