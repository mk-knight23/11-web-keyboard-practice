/**
 * HTML-escaping + payload-coercion helpers. Every string that reaches an
 * innerHTML template MUST pass through escapeHtml; every imported record
 * MUST be rebuilt from validated primitives (never spread raw).
 */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// The app's real modes (see index.html mode buttons + session state).
// The previous allowlist ('timed'/'zen') did not match the app's 'time'
// mode, so every timed entry was corrupted to 'timed' on export→import.
const ALLOWED_MODES = new Set(['time', 'word', 'code', 'quotes', 'weak']);
const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

export function toFiniteNumber(value, fallback = 0) {
  try {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    // Objects with poisoned toString/valueOf throw on coercion.
    return fallback;
  }
}

/**
 * Rebuild a history entry from validated primitives. Returns null when the
 * entry is not salvageable. Unknown fields are dropped by construction.
 */
export function sanitizeHistoryEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const date = new Date(raw.date);
  if (Number.isNaN(date.getTime())) return null;
  // Canonicalize entries corrupted by the old allowlist ('timed' → 'time'),
  // then validate against the real mode set; unknown modes fall back to 'time'.
  const candidateMode = raw.mode === 'timed' ? 'time' : raw.mode;
  const mode = ALLOWED_MODES.has(candidateMode) ? candidateMode : 'time';
  const difficulty = ALLOWED_DIFFICULTIES.has(raw.difficulty) ? raw.difficulty : 'easy';
  const entry = {
    date: date.toISOString(),
    wpm: toFiniteNumber(raw.wpm),
    rawWPM: toFiniteNumber(raw.rawWPM),
    accuracy: Math.max(0, Math.min(100, toFiniteNumber(raw.accuracy))),
    time: toFiniteNumber(raw.time),
    errors: toFiniteNumber(raw.errors),
    mode,
    difficulty,
  };
  // Preserve the metrics-v2 tag (literal 2 only); absence marks a pre-v2
  // entry measured with the inflated legacy counting.
  if (raw.metricsVersion === 2) entry.metricsVersion = 2;
  return entry;
}

/**
 * Rebuild stats from validated numbers only. The metrics-v2 fields
 * (legacyBestWPM archive + metricsVersion tag) are preserved so a v2
 * backup round-trips intact; metricsVersion is only kept when it is
 * exactly the literal 2 — anything else is dropped so pre-v2 imports
 * are archived by the load-time migration (history.migrateStatsToV2).
 */
export function sanitizeStats(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { tests: 0, bestWPM: 0, legacyBestWPM: 0 };
  }
  const clean = {
    tests: Math.max(0, toFiniteNumber(raw.tests)),
    bestWPM: Math.max(0, toFiniteNumber(raw.bestWPM)),
    legacyBestWPM: Math.max(0, toFiniteNumber(raw.legacyBestWPM)),
  };
  if (raw.metricsVersion === 2) clean.metricsVersion = 2;
  return clean;
}

const MAX_KEY_LABEL_LENGTH = 12;

/**
 * Rebuild per-key stats: keys capped in length (still escaped at render),
 * values coerced to finite numbers.
 */
export function sanitizePerKey(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LABEL_LENGTH) continue;
    if (!value || typeof value !== 'object') continue;
    const hits = Math.max(0, toFiniteNumber(value.hits));
    const misses = Math.max(0, toFiniteNumber(value.misses));
    const total = Math.max(0, toFiniteNumber(value.total, hits + misses));
    out[key] = {
      hits,
      misses,
      total,
      // Fallback 0 (not 100): junk input must never display as perfect accuracy.
      accuracy: Math.max(0, Math.min(100, toFiniteNumber(value.accuracy, 0))),
    };
  }
  return out;
}
