/**
 * DOM element registry, page-section navigation, message toasts, and the
 * live word-display renderer. All DOM lookups live here so the rest of the
 * app never calls document.getElementById directly.
 */

export const el = {};

/** Populate the element registry. Must run once after the DOM is parsed. */
export function initElements() {
  Object.assign(el, {
    // V3 theme engine + zen + mobile nav controls
    themeButtons: document.querySelectorAll('[data-set-theme]'),
    motionToggle: document.getElementById('motionToggle'),
    transparencyToggle: document.getElementById('transparencyToggle'),
    zenToggle: document.getElementById('zenToggle'),
    zenExit: document.getElementById('zenExit'),
    navMenuToggle: document.getElementById('navMenuToggle'),
    navMenu: document.getElementById('navMenu'),
    heroCta: document.getElementById('heroCta'),
    statWPM: document.getElementById('statWPM'),
    statRawWPM: document.getElementById('statRawWPM'),
    statAccuracy: document.getElementById('statAccuracy'),
    statTests: document.getElementById('statTests'),
    statBest: document.getElementById('statBest'),
    difficulty: document.getElementById('difficulty'),
    modeButtons: document.querySelectorAll('.btn-option[data-mode]'),
    timerGroup: document.getElementById('timerGroup'),
    codeLanguageGroup: document.getElementById('codeLanguageGroup'),
    codeLanguage: document.getElementById('codeLanguage'),
    timerDuration: document.getElementById('timerDuration'),
    timerDisplay: document.getElementById('timerDisplay'),
    timerValue: document.getElementById('timerValue'),
    message: document.getElementById('message'),
    wordDisplay: document.getElementById('wordDisplay'),
    wordText: document.getElementById('wordText'),
    wordInput: document.getElementById('wordInput'),
    startBtn: document.getElementById('startBtn'),
    resetBtn: document.getElementById('resetBtn'),
    historyBtn: document.getElementById('historyBtn'),
    historySection: document.getElementById('historySection'),
    historyList: document.getElementById('historyList'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    resultsModal: document.getElementById('resultsModal'),
    modalWPM: document.getElementById('modalWPM'),
    modalRawWPM: document.getElementById('modalRawWPM'),
    modalAccuracy: document.getElementById('modalAccuracy'),
    modalErrors: document.getElementById('modalErrors'),
    modalConsistency: document.getElementById('modalConsistency'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalRestartBtn: document.getElementById('modalRestartBtn'),
    modalPersonalBest: document.getElementById('modalPersonalBest'),
    gameArea: document.getElementById('gameArea'),
    // v2.4 — weak-key practice, heatmap, data controls, dashboard
    weakKeyGroup: document.getElementById('weakKeyGroup'),
    weakKeyToggle: document.getElementById('weakKeyToggle'),
    weakKeyInfo: document.getElementById('weakKeyInfo'),
    keyboardHeatmap: document.getElementById('keyboardHeatmap'),
    heatmapHint: document.getElementById('heatmapHint'),
    exportDataBtn: document.getElementById('exportDataBtn'),
    importDataBtn: document.getElementById('importDataBtn'),
    importFileInput: document.getElementById('importFileInput'),
    deleteAllDataBtn: document.getElementById('deleteAllDataBtn'),
    progressDashboard: document.getElementById('progressDashboard'),
  });
}

/**
 * Reduced motion honored for real: JS-driven scrolling checks both the
 * in-app setting (data-motion="reduced") and the OS media query, matching
 * the CSS kill-switch in main.css.
 * @returns {'auto' | 'smooth'}
 */
export function scrollBehavior() {
  const reduced =
    document.documentElement.getAttribute('data-motion') === 'reduced' ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  return reduced ? 'auto' : 'smooth';
}

/** Switch between the main / guide / about page sections. */
export function showSection(name) {
  document
    .querySelectorAll('.page-section')
    .forEach((s) => s.classList.remove('active'));
  const section = document.getElementById('section-' + name);
  if (section) section.classList.add('active');

  document
    .querySelectorAll('.nav-link')
    .forEach((l) => l.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach((l) => {
    if (
      l.textContent.toLowerCase().includes(name === 'main' ? 'practice' : name)
    ) {
      l.classList.add('active');
    }
  });
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

/** Transient status toast above the word display. */
export function showMessage(text, type = 'info') {
  el.message.textContent = text;
  el.message.className = `show ${type}`;
  setTimeout(() => {
    el.message.className = '';
  }, 3000);
}

/**
 * Render the target text with per-character correct/incorrect/current
 * highlighting based on what has been typed so far.
 * @param {string} typed
 * @param {string} target
 */
export function displayWord(typed, target) {
  let html = '';
  for (let i = 0; i < target.length; i++) {
    let cls = 'char';
    if (i < typed.length) {
      cls += typed[i] === target[i] ? ' correct' : ' incorrect';
    }
    if (i === typed.length) cls += ' current';
    // Escape HTML entities
    const ch =
      target[i] === '<'
        ? '&lt;'
        : target[i] === '>'
          ? '&gt;'
          : target[i] === '&'
            ? '&amp;'
            : target[i];
    html += `<span class="${cls}">${ch}</span>`;
  }
  el.wordText.innerHTML = html;

  el.wordDisplay.classList.remove('correct', 'incorrect');
  if (typed === target) {
    el.wordDisplay.classList.add('correct');
  } else if (
    typed.length > 0 &&
    typed[typed.length - 1] !== target[typed.length - 1]
  ) {
    el.wordDisplay.classList.add('incorrect');
  }
}
