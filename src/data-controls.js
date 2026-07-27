/**
 * Export / import / delete-all controls for locally stored data.
 * Export downloads storage.exportAll() as a JSON file; import validates the
 * payload and routes through storage.importAll(); delete-all clears every
 * namespaced key plus the pre-migration legacy keys.
 */
import { el, showMessage } from './ui.js';
import { exportAll, importAll, clearAll } from './lib/storage.js';
import {
  LEGACY_KEYS,
  getHistoryLimit,
  loadPersistedData,
  updateStatsDisplay,
  renderHistory,
} from './history.js';
import { renderHeatmap } from './heatmap.js';
import {
  sanitizeHistoryEntry,
  sanitizeStats,
  sanitizePerKey,
} from './sanitize.js';

const EXPORT_VERSION = 1;

/**
 * Structural validation for an imported backup payload.
 * @param {unknown} payload
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateImportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'Backup must be a JSON object.' };
  }
  if (payload.version !== EXPORT_VERSION) {
    return {
      ok: false,
      reason: `Unsupported backup version (expected ${EXPORT_VERSION}).`,
    };
  }
  if (
    !payload.data ||
    typeof payload.data !== 'object' ||
    Array.isArray(payload.data)
  ) {
    return { ok: false, reason: 'Backup is missing its data section.' };
  }
  if ('history' in payload.data && !Array.isArray(payload.data.history)) {
    return { ok: false, reason: 'Backup history must be an array.' };
  }
  if (
    'stats' in payload.data &&
    (typeof payload.data.stats !== 'object' || payload.data.stats === null)
  ) {
    return { ok: false, reason: 'Backup stats must be an object.' };
  }
  return { ok: true };
}

/**
 * Deep-sanitize a structurally valid payload: every record is rebuilt from
 * validated primitives so imported strings can never reach an innerHTML
 * template unmodified. Returns a NEW payload object.
 */
export function sanitizeImportPayload(payload) {
  const data = payload.data;
  const clean = {};
  if (Array.isArray(data.history)) {
    clean.history = data.history
      .map((entry) => sanitizeHistoryEntry(entry))
      .filter(Boolean)
      .slice(0, getHistoryLimit());
  }
  if (data.stats) clean.stats = sanitizeStats(data.stats);
  if (data.perKey) clean.perKey = sanitizePerKey(data.perKey);
  if (
    typeof data.theme === 'string' &&
    ['light', 'dark'].includes(data.theme)
  ) {
    clean.theme = data.theme;
  }
  return { version: payload.version, data: clean };
}

function refreshAfterDataChange() {
  loadPersistedData();
  updateStatsDisplay();
  renderHistory();
  renderHeatmap();
}

function handleExport() {
  const payload = exportAll();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `typesprint-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showMessage('Data exported as JSON.', 'success');
}

async function handleImportFile(file) {
  if (!file) return;
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    showMessage('Import failed: file is not valid JSON.', 'error');
    return;
  }
  const validation = validateImportPayload(payload);
  if (!validation.ok) {
    showMessage(`Import failed: ${validation.reason}`, 'error');
    return;
  }
  payload = sanitizeImportPayload(payload);
  if (!importAll(payload)) {
    showMessage('Import failed: data could not be saved.', 'error');
    return;
  }
  refreshAfterDataChange();
  showMessage('Data imported successfully.', 'success');
}

function handleDeleteAll() {
  const confirmed = confirm(
    'This permanently deletes ALL locally stored TypeSprint data (history, stats, per-key accuracy, theme). Continue?'
  );
  if (!confirmed) return;
  clearAll();
  try {
    for (const legacyKey of Object.values(LEGACY_KEYS)) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // ignore
  }
  refreshAfterDataChange();
  showMessage('All local data deleted.', 'info');
}

/** Wire the export/import/delete buttons. Call once at bootstrap. */
export function initDataControls() {
  if (el.exportDataBtn)
    el.exportDataBtn.addEventListener('click', handleExport);
  if (el.importDataBtn && el.importFileInput) {
    el.importDataBtn.addEventListener('click', () =>
      el.importFileInput.click()
    );
    el.importFileInput.addEventListener('change', (e) => {
      handleImportFile(e.target.files && e.target.files[0]);
      e.target.value = '';
    });
  }
  if (el.deleteAllDataBtn)
    el.deleteAllDataBtn.addEventListener('click', handleDeleteAll);
}
