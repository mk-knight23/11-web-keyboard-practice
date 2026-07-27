/**
 * App orchestrator — wires DOM events to the session, results, history,
 * and theme modules. This is the only module with top-level side effects.
 */
import { initElements, el, showSection, scrollBehavior } from './ui.js';
import { initTheme } from './theme.js';
import { initZen, isZen, setZen, toggleZen } from './zen.js';
import { initNavMenu } from './nav-menu.js';
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
import {
  initHistoryStore,
  setHistoryWriteErrorHandler,
} from './lib/storage.js';
import {
  shouldStartOnSpace,
  shouldAbortOnEscape,
  isEditableTarget,
} from './keyboard.js';
import { getWeakPracticeWord, updateWeakKeyExplainer } from './practice.js';
import { renderHeatmap } from './heatmap.js';
import { renderDashboard } from './dashboard.js';
import { initDataControls } from './data-controls.js';
import { endTest, hideResultsModal } from './results.js';
import {
  migrateLegacyData,
  loadPersistedData,
  notifySaveFailure,
  updateStatsDisplay,
  renderHistory,
  deleteHistoryItem,
  clearHistory,
} from './history.js';
import { track } from './analytics.js';
import { initAnalyticsLoader } from './analytics-loader.js';

/* ============================================
   Bootstrap
   ============================================ */
initAnalyticsLoader();
initElements();
migrateLegacyData();
// History backend: prefer IndexedDB (higher entry cap, no quota pressure on
// the rest of localStorage) with a one-time non-destructive migration. Must
// run AFTER migrateLegacyData (legacy key → namespaced → IndexedDB) and
// BEFORE loadPersistedData, which reads through the store's sync façade.
// Top-level await: modern browsers only (matches the Vite build target);
// when IndexedDB is unavailable the store falls back to localStorage.
await initHistoryStore();
// Async write-behind failures reuse the Wave 2 save-failure notice.
setHistoryWriteErrorHandler(() => notifySaveFailure());
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

/* ============================================
   Event Listeners
   ============================================ */
// SPA section links (nav + footer). Kept as addEventListener wiring instead
// of inline onclick so the CSP script-src needs no 'unsafe-inline'.
document.querySelectorAll('a[data-section]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    showSection(link.dataset.section);
  });
});

// History-row delete buttons are re-rendered on every renderHistory() call,
// so they are handled via delegation on the stable list container.
el.historyList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-history-index]');
  if (!btn) return;
  deleteHistoryItem(Number(btn.dataset.historyIndex));
  renderDashboard();
});

el.heroCta.addEventListener('click', () => {
  el.startBtn.click();
  el.wordInput.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
});

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

// Idempotent registration: bootstrapping twice (dev HMR, test re-boots via
// vi.resetModules) must not stack document-level handlers — zen acts on the
// shared <html> element, so a stale duplicate handler would double-toggle.
const KEYDOWN_HANDLER_KEY = '__typesprintKeydownHandler';
if (document[KEYDOWN_HANDLER_KEY]) {
  document.removeEventListener('keydown', document[KEYDOWN_HANDLER_KEY]);
}
const onDocumentKeydown = (e) => {
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
    // Priority 3: exit zen mode (see src/zen.js for the full contract).
    if (isZen()) {
      setZen(false);
      return;
    }
  }
  // Z toggles zen only when focus is NOT on an editable target — during an
  // active test focus lives in the typing input, so "z" is just a letter.
  // Also inert while the results modal is open (it owns focus).
  if (
    (e.key === 'z' || e.key === 'Z') &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !isEditableTarget(document.activeElement) &&
    !el.resultsModal.classList.contains('show')
  ) {
    toggleZen();
    return;
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
};
document[KEYDOWN_HANDLER_KEY] = onDocumentKeydown;
document.addEventListener('keydown', onDocumentKeydown);

/* ============================================
   Init
   ============================================ */
initDataControls();
initTheme();
// Entering zen always lands on the test — never a blanked-out About page.
initZen({ onEnter: () => showSection('main') });
initNavMenu();
updateStatsDisplay();
renderHistory();
renderHeatmap();
renderDashboard();
