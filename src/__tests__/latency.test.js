import { describe, it, expect, beforeEach } from 'vitest';
import { recordSessionLatency } from '../latency.js';
import { read, STORAGE_KEYS } from '../lib/storage.js';

/** Single-keyed forward strike record. */
const strike = (t, seg, pos, key, correct = true) => ({
  t,
  seg,
  pos,
  span: 1,
  keys: [{ key, correct }],
});

beforeEach(() => {
  localStorage.clear();
});

describe('recordSessionLatency (wave 3 — persisted data layer, no UI)', () => {
  it('persists per-key and bigram aggregates from a session strike log', () => {
    const strikes = [
      strike(100, 0, 0, 'c'),
      strike(220, 0, 1, 'a'),
      strike(300, 0, 2, 't'),
    ];
    recordSessionLatency(strikes);

    expect(read(STORAGE_KEYS.KEY_LATENCY, null)).toEqual({
      a: { count: 1, totalMs: 120 },
      t: { count: 1, totalMs: 80 },
    });
    expect(read(STORAGE_KEYS.BIGRAM_LATENCY, null)).toEqual({
      ca: { count: 1, totalMs: 120 },
      at: { count: 1, totalMs: 80 },
    });
  });

  it('merges across sessions instead of overwriting', () => {
    const session = [strike(0, 0, 0, 'c'), strike(100, 0, 1, 'a')];
    recordSessionLatency(session);
    recordSessionLatency(session);

    expect(read(STORAGE_KEYS.KEY_LATENCY, null).a).toEqual({
      count: 2,
      totalMs: 200,
    });
    expect(read(STORAGE_KEYS.BIGRAM_LATENCY, null).ca).toEqual({
      count: 2,
      totalMs: 200,
    });
  });

  it('is a no-op for sessions that produced no attributable latencies', () => {
    recordSessionLatency([]);
    recordSessionLatency([strike(100, 0, 0, 'a')]); // first strike: no interval
    expect(read(STORAGE_KEYS.KEY_LATENCY, null)).toBeNull();
    expect(read(STORAGE_KEYS.BIGRAM_LATENCY, null)).toBeNull();
  });
});
