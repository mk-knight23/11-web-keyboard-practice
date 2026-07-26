/**
 * Per-key and bigram latency persistence (Wave 3 — data layer only).
 * Aggregates a finished session's strike log into running totals stored
 * via the versioned storage layer. No UI reads these yet: they feed the
 * Wave 4 adaptive engine and dashboards. Mean latency is derived by
 * consumers as totalMs / count.
 */
import { read, write, STORAGE_KEYS } from './lib/storage.js';
import { notifySaveFailure } from './history.js';
import {
  aggregateKeyLatencies,
  aggregateBigramLatencies,
  mergeLatencyStats,
} from './lib/typing-metrics.js';

/** Read a persisted latency aggregate ({} when nothing stored/corrupt). */
function loadAggregate(name) {
  const stored = read(name, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored)
    ? stored
    : {};
}

/**
 * Merge one finished session's latency data into the persisted aggregates.
 * Sessions that produced no attributable latencies write nothing.
 * @param {Array<{ t:number, seg:number, pos:number, span:number,
 *                 keys:Array<{key:string,correct:boolean}> }>} strikes
 * @returns {{ perKey: object, bigrams: object }} the merged aggregates
 */
export function recordSessionLatency(strikes) {
  const sessionKeys = aggregateKeyLatencies(strikes);
  const sessionBigrams = aggregateBigramLatencies(strikes);

  let perKey = loadAggregate(STORAGE_KEYS.KEY_LATENCY);
  let bigrams = loadAggregate(STORAGE_KEYS.BIGRAM_LATENCY);

  if (Object.keys(sessionKeys).length > 0) {
    perKey = mergeLatencyStats(perKey, sessionKeys);
    if (!write(STORAGE_KEYS.KEY_LATENCY, perKey)) notifySaveFailure();
  }
  if (Object.keys(sessionBigrams).length > 0) {
    bigrams = mergeLatencyStats(bigrams, sessionBigrams);
    if (!write(STORAGE_KEYS.BIGRAM_LATENCY, bigrams)) notifySaveFailure();
  }
  return { perKey, bigrams };
}
