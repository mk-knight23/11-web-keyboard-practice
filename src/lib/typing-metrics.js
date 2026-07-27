/**
 * Pure typing metrics — no DOM, no side effects. Safe to unit test.
 *
 * Conventions:
 * - "word" = 5 characters (standard WPM convention used by Monkeytype, 10FastFingers, etc.)
 * - totalChars = every character the user produced, correct or incorrect (excludes backspaces)
 * - correctChars = characters that matched the target
 * - elapsedSec = seconds elapsed since the test started
 */

const CHARS_PER_WORD = 5;

/**
 * Metrics schema version. v2 = correction-aware first-strike counting
 * (backspaces never inflate accuracy/WPM; overflow counts as errors).
 * Results and stats produced before v2 were measured with inflated
 * counting and are not comparable — see docs/v3/METRICS_V2.md.
 */
export const METRICS_VERSION = 2;

/**
 * Raw WPM — chars/5 divided by minutes. Ignores accuracy.
 * @param {number} totalChars
 * @param {number} elapsedSec
 * @returns {number} rounded to nearest int; 0 when elapsedSec <= 0
 */
export function calculateRawWpm(totalChars, elapsedSec) {
  if (!Number.isFinite(totalChars) || totalChars <= 0) return 0;
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  const minutes = elapsedSec / 60;
  return Math.round(totalChars / CHARS_PER_WORD / minutes);
}

/**
 * Net WPM — correct-chars/5 divided by minutes. Penalizes errors.
 * @param {number} correctChars
 * @param {number} elapsedSec
 * @returns {number}
 */
export function calculateNetWpm(correctChars, elapsedSec) {
  if (!Number.isFinite(correctChars) || correctChars <= 0) return 0;
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  const minutes = elapsedSec / 60;
  return Math.round(correctChars / CHARS_PER_WORD / minutes);
}

/**
 * Accuracy percentage, rounded to nearest int.
 * @param {number} correctChars
 * @param {number} totalChars
 * @returns {number} 0..100
 */
export function calculateAccuracy(correctChars, totalChars) {
  if (!Number.isFinite(totalChars) || totalChars <= 0) return 0;
  if (!Number.isFinite(correctChars) || correctChars < 0) return 0;
  const capped = Math.min(correctChars, totalChars);
  return Math.round((capped / totalChars) * 100);
}

/**
 * Minimum number of valid inter-keystroke intervals required before a
 * consistency score is reported. Below this, the coefficient of variation
 * is statistically meaningless noise — the metric returns null (rendered
 * as "—") instead of a fake number. 10 intervals ≈ 11 keystrokes ≈ two
 * short words: the smallest sample where CV starts to stabilize.
 */
export const MIN_CONSISTENCY_INTERVALS = 10;

/**
 * Consistency: how steady the typing rhythm is, expressed 0..100.
 *
 * Formula (documented in docs/v3/METRICS_V2.md § Consistency):
 *   CV = stdev(intervals) / mean(intervals)   (population stdev)
 *   consistency = clamp(0, 100, round((1 - CV) * 100))
 * where intervals are the milliseconds between successive scored strikes.
 * A metronome-steady rhythm has CV 0 → 100; a rhythm whose variation is
 * as large as its mean (CV >= 1) scores 0.
 *
 * Min-sample rule: fewer than MIN_CONSISTENCY_INTERVALS valid intervals
 * (non-finite and non-positive values are discarded first) returns null —
 * short samples must never fabricate a score.
 * @param {number[]} intervalsMs — time between successive keystrokes
 * @returns {number | null} 0..100, or null when the sample is too small
 */
export function calculateConsistency(intervalsMs) {
  if (!Array.isArray(intervalsMs)) return null;
  const valid = intervalsMs.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length < MIN_CONSISTENCY_INTERVALS) return null;
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  if (mean === 0) return null;
  const variance =
    valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length;
  const stdev = Math.sqrt(variance);
  const cv = stdev / mean;
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
}

/**
 * Inter-strike intervals from a session strike log (see session.buildStrike).
 * Consecutive pairs with a non-finite timestamp on either side are skipped
 * so a malformed record can never poison the consistency sample with NaN.
 * @param {Array<{ t: number }>} strikes — chronological strike records
 * @returns {number[]} milliseconds between successive strikes
 */
export function strikeIntervalsMs(strikes) {
  if (!Array.isArray(strikes) || strikes.length < 2) return [];
  const intervals = [];
  for (let i = 1; i < strikes.length; i++) {
    const prev = strikes[i - 1]?.t;
    const cur = strikes[i]?.t;
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    intervals.push(cur - prev);
  }
  return intervals;
}

/**
 * Outlier ceiling for latency attribution. Intervals longer than this are
 * pauses (thinking, distraction), not typing latency, and are excluded
 * from per-key/bigram aggregation. Consistency, by contrast, keeps pauses
 * — rhythm is honest about stops; latency measures finger speed.
 */
export const MAX_LATENCY_INTERVAL_MS = 5000;

/** Lowercase a single-char key; longer labels pass through unchanged. */
function normalizeLatencyKey(key) {
  return typeof key === 'string' ? key.toLowerCase() : null;
}

/**
 * A strike qualifies for latency attribution when it scored exactly one
 * position and that position was within the target (span 1, one key).
 * Multi-char strikes (paste / IME commits) are one physical action for N
 * chars — attributing their interval to any single key would be a lie.
 * @param {{ span: number, keys: Array<{key: string}> }} s
 */
function isSingleKeyStrike(s) {
  return !!s && s.span === 1 && Array.isArray(s.keys) && s.keys.length === 1;
}

/**
 * Per-key latency aggregation from a session strike log (data layer for
 * the Wave 4 adaptive engine — no UI). The latency of a strike is the
 * interval since the previous strike, attributed to the key it scored.
 * The first strike of a session has no interval; multi-char strikes and
 * pauses above MAX_LATENCY_INTERVAL_MS are skipped. Mean latency is
 * derived by consumers as totalMs / count (no rounding drift stored).
 * @param {Array<{ t:number, seg:number, pos:number, span:number,
 *                 keys:Array<{key:string,correct:boolean}> }>} strikes
 * @param {{ maxIntervalMs?: number }} [opts]
 * @returns {Record<string, { count: number, totalMs: number }>}
 */
export function aggregateKeyLatencies(strikes, opts = {}) {
  const maxIntervalMs = opts.maxIntervalMs ?? MAX_LATENCY_INTERVAL_MS;
  const out = {};
  if (!Array.isArray(strikes)) return out;
  for (let i = 1; i < strikes.length; i++) {
    const prev = strikes[i - 1];
    const cur = strikes[i];
    if (!isSingleKeyStrike(cur)) continue;
    const interval = cur.t - prev?.t;
    if (!Number.isFinite(interval) || interval <= 0) continue;
    if (interval > maxIntervalMs) continue;
    const key = normalizeLatencyKey(cur.keys[0].key);
    if (!key) continue;
    const entry = out[key] || { count: 0, totalMs: 0 };
    out[key] = { count: entry.count + 1, totalMs: entry.totalMs + interval };
  }
  return out;
}

/**
 * Bigram latency aggregation: the interval between two consecutive
 * single-key strikes that scored ADJACENT positions of the SAME target
 * text (segment). Corrections (position gaps), text changes (segment
 * bumps), multi-char strikes, and outlier pauses all break the bigram.
 * @param {Array<{ t:number, seg:number, pos:number, span:number,
 *                 keys:Array<{key:string,correct:boolean}> }>} strikes
 * @param {{ maxIntervalMs?: number }} [opts]
 * @returns {Record<string, { count: number, totalMs: number }>} keyed by
 *   the two-char bigram (e.g. "th")
 */
export function aggregateBigramLatencies(strikes, opts = {}) {
  const maxIntervalMs = opts.maxIntervalMs ?? MAX_LATENCY_INTERVAL_MS;
  const out = {};
  if (!Array.isArray(strikes)) return out;
  for (let i = 1; i < strikes.length; i++) {
    const prev = strikes[i - 1];
    const cur = strikes[i];
    if (!isSingleKeyStrike(prev) || !isSingleKeyStrike(cur)) continue;
    if (cur.seg !== prev.seg || cur.pos !== prev.pos + 1) continue;
    const interval = cur.t - prev.t;
    if (!Number.isFinite(interval) || interval <= 0) continue;
    if (interval > maxIntervalMs) continue;
    const a = normalizeLatencyKey(prev.keys[0].key);
    const b = normalizeLatencyKey(cur.keys[0].key);
    if (!a || !b) continue;
    const bigram = a + b;
    const entry = out[bigram] || { count: 0, totalMs: 0 };
    out[bigram] = {
      count: entry.count + 1,
      totalMs: entry.totalMs + interval,
    };
  }
  return out;
}

/**
 * Pure merge of a session latency aggregate into the persisted running
 * aggregate. Returns a NEW object — inputs are never mutated. Junk values
 * coerce to 0 so a corrupted stored aggregate can never poison new data.
 * @param {Record<string, { count: number, totalMs: number }>} aggregate
 * @param {Record<string, { count: number, totalMs: number }>} session
 * @returns {Record<string, { count: number, totalMs: number }>}
 */
export function mergeLatencyStats(aggregate, session) {
  const merged = {};
  const toNum = (v) => (Number.isFinite(v) ? v : 0);
  for (const source of [aggregate || {}, session || {}]) {
    for (const [key, stat] of Object.entries(source)) {
      if (!stat || typeof stat !== 'object') continue;
      const prev = merged[key] || { count: 0, totalMs: 0 };
      merged[key] = {
        count: prev.count + toNum(stat.count),
        totalMs: prev.totalMs + toNum(stat.totalMs),
      };
    }
  }
  return merged;
}

/**
 * Per-key breakdown of hits, misses, and derived accuracy.
 * @param {Array<{ key: string, correct: boolean }>} keystrokes
 * @returns {Record<string, { hits: number, misses: number, total: number, accuracy: number }>}
 */
export function calculatePerKeyStats(keystrokes) {
  const map = {};
  if (!Array.isArray(keystrokes)) return map;
  for (const k of keystrokes) {
    if (!k || typeof k.key !== 'string') continue;
    if (!map[k.key])
      map[k.key] = { hits: 0, misses: 0, total: 0, accuracy: 100 };
    map[k.key].total += 1;
    if (k.correct) map[k.key].hits += 1;
    else map[k.key].misses += 1;
  }
  for (const key of Object.keys(map)) {
    const entry = map[key];
    entry.accuracy =
      entry.total > 0 ? Math.round((entry.hits / entry.total) * 100) : 100;
  }
  return map;
}

/**
 * Identify the N weakest keys by accuracy, requiring a minimum sample size.
 * @param {ReturnType<typeof calculatePerKeyStats>} perKey
 * @param {{ topN?: number, minSamples?: number }} [opts]
 */
export function findWeakestKeys(perKey, opts = {}) {
  const topN = opts.topN ?? 5;
  const minSamples = opts.minSamples ?? 3;
  return Object.entries(perKey || {})
    .filter(([, v]) => v.total >= minSamples)
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
    .slice(0, topN);
}

/**
 * Final result summary combining every metric — used by test-end display.
 * @param {{
 *   totalChars: number,
 *   correctChars: number,
 *   elapsedSec: number,
 *   errors: number,
 *   intervalsMs?: number[],
 *   keystrokes?: Array<{ key: string, correct: boolean }>,
 * }} input
 */
export function summarizeTest(input) {
  const totalChars = input.totalChars ?? 0;
  const correctChars = input.correctChars ?? 0;
  const elapsedSec = input.elapsedSec ?? 0;
  return {
    rawWpm: calculateRawWpm(totalChars, elapsedSec),
    netWpm: calculateNetWpm(correctChars, elapsedSec),
    accuracy: calculateAccuracy(correctChars, totalChars),
    consistency: calculateConsistency(input.intervalsMs ?? []),
    perKey: calculatePerKeyStats(input.keystrokes ?? []),
    errors: input.errors ?? Math.max(0, totalChars - correctChars),
    totalChars,
    correctChars,
    elapsedSec,
  };
}
