import { describe, it, expect } from 'vitest';
import { getWeakKeyWord, wordBanks } from '../content.js';

/** mulberry32 — tiny deterministic PRNG for seeded tests. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEAK = ['z', 'q'];
const wordHasWeakKey = (word) => WEAK.some((k) => word.includes(k));

describe('getWeakKeyWord', () => {
  it('always returns a word from the requested bank', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      expect(wordBanks.hard).toContain(getWeakKeyWord(WEAK, 'hard', rng));
    }
  });

  it('falls back to the full bank when no word contains a weak key', () => {
    const rng = mulberry32(2);
    // No easy word contains "0" — pool is empty, full bank must be used.
    const word = getWeakKeyWord(['0'], 'easy', rng);
    expect(wordBanks.easy).toContain(word);
  });

  it('falls back to the full bank for an empty weak-key list', () => {
    const word = getWeakKeyWord([], 'medium', mulberry32(3));
    expect(wordBanks.medium).toContain(word);
  });
});

describe('getWeakKeyWord — elevated weak-key frequency', () => {
  it('draws words containing weak keys at an elevated rate vs the bank baseline', () => {
    const bank = wordBanks.hard;
    const baselineRate = bank.filter(wordHasWeakKey).length / bank.length;
    const rng = mulberry32(7);
    const words = [];
    for (let i = 0; i < 200; i++) words.push(getWeakKeyWord(WEAK, 'hard', rng));
    const drawnRate = words.filter(wordHasWeakKey).length / words.length;
    expect(drawnRate).toBeGreaterThan(baselineRate * 2);
  });
});
