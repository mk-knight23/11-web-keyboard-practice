import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  sanitizeHistoryEntry,
  sanitizeStats,
  sanitizePerKey,
  toFiniteNumber,
} from '../sanitize.js';
import { sanitizeImportPayload } from '../data-controls.js';

describe('escapeHtml', () => {
  it('escapes all five metacharacters', () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')" & more>`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot; &amp; more&gt;'
    );
  });
  it('stringifies non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(null)).toBe('null');
  });
});

describe('sanitizeHistoryEntry', () => {
  it('rebuilds a clean entry from valid input', () => {
    const entry = sanitizeHistoryEntry({
      date: '2026-07-22T10:00:00.000Z',
      wpm: 62,
      rawWPM: 65,
      accuracy: 97,
      time: 60,
      errors: 3,
      mode: 'timed',
      difficulty: 'medium',
    });
    expect(entry).toEqual({
      date: '2026-07-22T10:00:00.000Z',
      wpm: 62,
      rawWPM: 65,
      accuracy: 97,
      time: 60,
      errors: 3,
      mode: 'timed',
      difficulty: 'medium',
    });
  });
  it('neutralizes an XSS payload in mode', () => {
    const entry = sanitizeHistoryEntry({
      date: '2026-07-22',
      wpm: 10,
      mode: '<img src=x onerror=alert(1)>',
    });
    expect(entry.mode).toBe('timed');
  });
  it('coerces string numbers and clamps accuracy', () => {
    const entry = sanitizeHistoryEntry({ date: '2026-07-22', wpm: '55', accuracy: '250' });
    expect(entry.wpm).toBe(55);
    expect(entry.accuracy).toBe(100);
  });
  it('rejects unparseable dates', () => {
    expect(sanitizeHistoryEntry({ date: '<script>', wpm: 10 })).toBeNull();
  });
  it('rejects non-objects', () => {
    expect(sanitizeHistoryEntry(null)).toBeNull();
    expect(sanitizeHistoryEntry([1])).toBeNull();
    expect(sanitizeHistoryEntry('x')).toBeNull();
  });
  it('drops unknown fields by construction', () => {
    const entry = sanitizeHistoryEntry({ date: '2026-07-22', evil: '<svg/onload=1>' });
    expect(entry.evil).toBeUndefined();
  });
  it('preserves a literal metricsVersion 2 tag and drops forged ones', () => {
    expect(
      sanitizeHistoryEntry({ date: '2026-07-22', wpm: 40, metricsVersion: 2 }).metricsVersion
    ).toBe(2);
    expect(
      sanitizeHistoryEntry({ date: '2026-07-22', wpm: 40, metricsVersion: '2<x>' }).metricsVersion
    ).toBeUndefined();
    expect(
      sanitizeHistoryEntry({ date: '2026-07-22', wpm: 40 }).metricsVersion
    ).toBeUndefined();
  });
});

describe('sanitizeStats / sanitizePerKey', () => {
  it('coerces stats to numbers', () => {
    expect(sanitizeStats({ tests: '9', bestWPM: '80<script>' })).toEqual({
      tests: 9,
      bestWPM: 0,
      legacyBestWPM: 0,
    });
  });
  it('preserves the metrics-v2 fields so a v2 backup round-trips intact', () => {
    expect(
      sanitizeStats({ tests: 2, bestWPM: 50, legacyBestWPM: 84, metricsVersion: 2 })
    ).toEqual({ tests: 2, bestWPM: 50, legacyBestWPM: 84, metricsVersion: 2 });
  });
  it('drops a forged metricsVersion so pre-v2 imports still get archived on load', () => {
    expect(sanitizeStats({ tests: 1, bestWPM: 99, metricsVersion: '2<x>' })).toEqual({
      tests: 1,
      bestWPM: 99,
      legacyBestWPM: 0,
    });
  });
  it('drops oversized or non-string perKey keys', () => {
    const out = sanitizePerKey({
      a: { hits: 3, misses: 1, total: 4, accuracy: 75 },
      '<img src=x onerror=alert(1)>': { hits: 1, misses: 0, total: 1, accuracy: 100 },
    });
    expect(Object.keys(out)).toEqual(['a']);
  });
  it('coerces malicious perKey values to safe numbers', () => {
    const out = sanitizePerKey({ e: { hits: 'x};evil', misses: 2, accuracy: '"><script>' } });
    expect(out.e).toEqual({ hits: 0, misses: 2, total: 2, accuracy: 0 });
  });
});

describe('sanitizeImportPayload end-to-end', () => {
  it('rebuilds a malicious backup into a safe payload', () => {
    const malicious = {
      version: 1,
      data: {
        history: [
          { date: '2026-07-22', wpm: 40, mode: '"><img src=x onerror=alert(1)>' },
          { date: 'not-a-date', wpm: 99 },
          'garbage',
        ],
        stats: { tests: '3', bestWPM: { toString: 'nope' } },
        perKey: { '<svg/onload=1>': { hits: 1 }, t: { hits: '5', misses: 0, accuracy: 90 } },
        theme: 'javascript:alert(1)',
        extraneous: '<script>steal()</script>',
      },
    };
    const clean = sanitizeImportPayload(malicious);
    expect(clean.data.history).toHaveLength(1);
    expect(clean.data.history[0].mode).toBe('timed');
    expect(clean.data.stats).toEqual({ tests: 3, bestWPM: 0, legacyBestWPM: 0 });
    expect(Object.keys(clean.data.perKey)).toEqual(['t']);
    expect(clean.data.theme).toBeUndefined();
    expect(clean.data.extraneous).toBeUndefined();
  });
});

describe('toFiniteNumber', () => {
  it('handles the edge zoo', () => {
    expect(toFiniteNumber('12.5')).toBe(12.5);
    expect(toFiniteNumber(NaN)).toBe(0);
    expect(toFiniteNumber(Infinity)).toBe(0);
    expect(toFiniteNumber(undefined, 7)).toBe(7);
  });
});
