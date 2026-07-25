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
 * Consistency: how steady the typing rhythm is, expressed 0..100.
 * Computed from inter-keystroke interval coefficient of variation.
 *
 * KEEP even though no caller supplies real intervals yet: Wave 3 rebuilds
 * the input pipeline with keystroke timestamps and wires this metric in.
 * @param {number[]} intervalsMs — time between successive keystrokes
 * @returns {number}
 */
export function calculateConsistency(intervalsMs) {
  if (!Array.isArray(intervalsMs) || intervalsMs.length < 2) return 0;
  const valid = intervalsMs.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length < 2) return 0;
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  if (mean === 0) return 0;
  const variance =
    valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length;
  const stdev = Math.sqrt(variance);
  const cv = stdev / mean;
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
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
