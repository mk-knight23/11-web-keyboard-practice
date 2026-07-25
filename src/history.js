/**
 * History + aggregate stats persistence and rendering. All persistence goes
 * through the versioned storage layer (src/lib/storage.js); legacy
 * unversioned keys are migrated once at startup by migrateLegacyData().
 */
import { el, showMessage } from './ui.js';
import { read, write, remove, exportAll, STORAGE_KEYS } from './lib/storage.js';
import { escapeHtml, toFiniteNumber } from './sanitize.js';
import { METRICS_VERSION } from './lib/typing-metrics.js';

const HISTORY_LIMIT = 100;
const DEFAULT_STATS = Object.freeze({
  tests: 0,
  bestWPM: 0,
  legacyBestWPM: 0,
  metricsVersion: METRICS_VERSION,
});

/** Legacy (pre-namespace) localStorage keys used by older releases. */
export const LEGACY_KEYS = Object.freeze({
  HISTORY: 'typingHistory',
  STATS: 'typingStats',
  THEME: 'theme',
});

let history = [];
let stats = { ...DEFAULT_STATS };

/* ============================================
   Legacy migration
   ============================================ */

function parseJsonOrNull(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const MIGRATIONS = [
  {
    name: STORAGE_KEYS.HISTORY,
    legacy: LEGACY_KEYS.HISTORY,
    parse: parseJsonOrNull,
  },
  {
    name: STORAGE_KEYS.STATS,
    legacy: LEGACY_KEYS.STATS,
    parse: parseJsonOrNull,
  },
  {
    name: STORAGE_KEYS.THEME,
    legacy: LEGACY_KEYS.THEME,
    // Older releases stored the theme as a raw (non-JSON) string.
    parse: (raw) => (raw === 'dark' || raw === 'light' ? raw : null),
  },
];

/**
 * One-time, non-destructive migration: copy legacy unversioned values into
 * the namespaced keys. Existing namespaced data is never overwritten, and
 * legacy keys are left in place. Safe to call on every startup.
 */
export function migrateLegacyData() {
  if (typeof localStorage === 'undefined') return;
  const namespaced = exportAll().data;
  for (const { name, legacy, parse } of MIGRATIONS) {
    if (Object.prototype.hasOwnProperty.call(namespaced, name)) continue;
    let raw = null;
    try {
      raw = localStorage.getItem(legacy);
    } catch {
      continue;
    }
    if (raw === null) continue;
    const value = parse(raw);
    if (value !== null && value !== undefined) write(name, value);
  }
}

/* ============================================
   Persistence
   ============================================ */

/**
 * Migrate a raw persisted stats object to the metrics-v2 shape (pure).
 *
 * Pre-v2 bestWPM values were measured with the inflated legacy counting
 * (backspaces counted as correct chars), so they must not stay the active
 * personal best. They are archived as legacyBestWPM and the active best
 * restarts fresh, tracked only from metricsVersion-2 results.
 * See docs/v3/METRICS_V2.md.
 * @param {unknown} raw
 * @returns {{ tests: number, bestWPM: number, legacyBestWPM: number, metricsVersion: number }}
 */
export function migrateStatsToV2(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_STATS };
  }
  if (raw.metricsVersion === METRICS_VERSION) {
    return { ...DEFAULT_STATS, ...raw };
  }
  return {
    tests: Math.max(0, toFiniteNumber(raw.tests)),
    bestWPM: 0,
    legacyBestWPM: Math.max(
      0,
      toFiniteNumber(raw.bestWPM),
      toFiniteNumber(raw.legacyBestWPM)
    ),
    metricsVersion: METRICS_VERSION,
  };
}

/** Load persisted history + stats into module state. Call after migration. */
export function loadPersistedData() {
  const loadedHistory = read(STORAGE_KEYS.HISTORY, []);
  history = Array.isArray(loadedHistory) ? loadedHistory : [];
  const loadedStats = read(STORAGE_KEYS.STATS, null);
  stats = migrateStatsToV2(loadedStats);
  // Persist the archival once so the legacy best survives future loads.
  if (loadedStats && loadedStats.metricsVersion !== METRICS_VERSION) {
    saveStats();
  }
}

export function getHistory() {
  return history;
}

export function getStats() {
  return stats;
}

export function saveStats() {
  write(STORAGE_KEYS.STATS, stats);
}

export function saveHistory() {
  write(STORAGE_KEYS.HISTORY, history);
}

export function addHistoryEntry(entry) {
  history.unshift(entry);
  if (history.length > HISTORY_LIMIT) history.pop();
  saveHistory();
}

/* ============================================
   Rendering
   ============================================ */

export function updateStatsDisplay() {
  el.statTests.textContent = stats.tests;
  el.statBest.textContent = stats.bestWPM;
}

export function renderHistory() {
  if (history.length === 0) {
    el.historySection.classList.remove('show');
    return;
  }
  el.historySection.classList.add('show');
  const html = history
    .map(
      (e, i) => `
        <div class="history-item">
          <span>${escapeHtml(new Date(e.date).toLocaleDateString())}</span>
          <span><strong>${escapeHtml(Number(e.wpm) || 0)}</strong> WPM</span>
          <span>${escapeHtml(Number(e.accuracy) || 0)}%</span>
          <span>${e.mode === 'word' ? 'Words' : e.mode === 'code' ? 'Code' : e.mode === 'quotes' ? 'Quote' : e.mode === 'weak' ? 'Weak Keys' : escapeHtml(Number(e.time) || 0) + 's'}</span>
          <button onclick="deleteHistoryItem(${i})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px" aria-label="Delete entry">×</button>
        </div>
      `
    )
    .join('');
  el.historyList.innerHTML = `
    <div class="history-item"><span class="history-label">Date</span><span class="history-label">WPM</span><span class="history-label">Accuracy</span><span class="history-label">Mode</span><span class="history-label"></span></div>
    ${html}
  `;
}

export function deleteHistoryItem(i) {
  history.splice(i, 1);
  saveHistory();
  renderHistory();
  showMessage('Entry deleted', 'info');
}

export function clearHistory() {
  if (confirm('Are you sure you want to clear all history?')) {
    history = [];
    remove(STORAGE_KEYS.HISTORY);
    // Also drop the legacy key so startup migration cannot resurrect it.
    try {
      localStorage.removeItem(LEGACY_KEYS.HISTORY);
    } catch {
      // ignore
    }
    renderHistory();
    showMessage('History cleared', 'info');
  }
}
