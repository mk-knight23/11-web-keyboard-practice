/**
 * Keyboard accuracy heatmap. Aggregates per-key hit/miss counts across
 * sessions (persisted via the versioned storage layer) and renders a CSS-grid
 * QWERTY keyboard colored green -> red by accuracy.
 */
import { el } from './ui.js';
import { read, write, STORAGE_KEYS } from './lib/storage.js';
import { notifySaveFailure } from './history.js';

export const QWERTY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  [' '],
];

/** Lowercase letters; everything else (digits, punctuation, space) as-is. */
export function normalizeKey(key) {
  if (typeof key !== 'string' || key.length !== 1) return null;
  return key.toLowerCase();
}

/**
 * Pure merge of a session's per-key stats into the running aggregate.
 * Returns a NEW object — inputs are not mutated.
 * @param {Record<string, {hits:number,misses:number,total:number,accuracy:number}>} aggregate
 * @param {Record<string, {hits:number,misses:number,total:number,accuracy:number}>} sessionPerKey
 */
export function mergePerKeyStats(aggregate, sessionPerKey) {
  const merged = {};
  for (const source of [aggregate || {}, sessionPerKey || {}]) {
    for (const [rawKey, stat] of Object.entries(source)) {
      const key = normalizeKey(rawKey);
      if (!key || !stat) continue;
      const prev = merged[key] || {
        hits: 0,
        misses: 0,
        total: 0,
        accuracy: 100,
      };
      const hits = prev.hits + (stat.hits || 0);
      const misses = prev.misses + (stat.misses || 0);
      const total = prev.total + (stat.total || 0);
      merged[key] = {
        hits,
        misses,
        total,
        accuracy: total > 0 ? Math.round((hits / total) * 100) : 100,
      };
    }
  }
  return merged;
}

/** Read the persisted aggregate (empty object when nothing stored). */
export function loadPerKeyStats() {
  const stored = read(STORAGE_KEYS.PER_KEY, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored)
    ? stored
    : {};
}

/** Merge one finished session's per-key stats into the persisted aggregate. */
export function recordSessionPerKey(sessionPerKey) {
  if (!sessionPerKey || Object.keys(sessionPerKey).length === 0)
    return loadPerKeyStats();
  const merged = mergePerKeyStats(loadPerKeyStats(), sessionPerKey);
  if (!write(STORAGE_KEYS.PER_KEY, merged)) notifySaveFailure();
  return merged;
}

/** Accuracy (0..100) to a green->red hue (0=red .. 120=green). */
function heatHue(accuracy) {
  return Math.max(0, Math.min(120, Math.round((accuracy / 100) * 120)));
}

/** Accuracy (0..100) to a green->red hsl background. */
function heatColor(accuracy) {
  return `hsl(${heatHue(accuracy)}, 72%, 42%)`;
}

/** HSL (h deg, s/l %) to an { r, g, b } triple (0..255). */
function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  };
}

/** WCAG sRGB relative luminance of an { r, g, b } triple. */
function relativeLuminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Legible label color for a heat key: black or white, whichever yields the
 * higher WCAG contrast against the key's own background. Because the optimal
 * black/white choice has a mathematical floor of ~4.58:1 for any background,
 * this guarantees >= 4.5:1 across the whole accuracy scale (worst case is the
 * mid-orange band near ~20% accuracy). Replaces the fixed white label that
 * measured as low as 2.12:1. Fixes audit TS-5.
 * @param {number} accuracy 0..100
 * @returns {'#ffffff' | '#000000'}
 */
export function heatLabelColor(accuracy) {
  const bg = relativeLuminance(hslToRgb(heatHue(accuracy), 72, 42));
  const contrastWhite = 1.05 / (bg + 0.05);
  const contrastBlack = (bg + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? '#ffffff' : '#000000';
}

function keyLabel(key) {
  return key === ' ' ? 'space' : key;
}

/** Render the QWERTY heatmap into #keyboardHeatmap. */
export function renderHeatmap() {
  if (!el.keyboardHeatmap) return;
  const stats = loadPerKeyStats();
  const hasData = Object.keys(stats).length > 0;

  const rowsHtml = QWERTY_ROWS.map((row) => {
    const keysHtml = row
      .map((key) => {
        const raw = stats[key];
        // Stored values may come from imported data — coerce to finite numbers
        // before they reach style/title attribute interpolation.
        const stat = raw
          ? {
              accuracy: Math.max(0, Math.min(100, Number(raw.accuracy) || 0)),
              hits: Math.max(0, Number(raw.hits) || 0),
              misses: Math.max(0, Number(raw.misses) || 0),
            }
          : null;
        const isSpace = key === ' ';
        const classes = `heatmap-key${isSpace ? ' heatmap-space' : ''}${stat ? '' : ' heatmap-empty'}`;
        const style = stat
          ? ` style="background:${heatColor(stat.accuracy)};color:${heatLabelColor(stat.accuracy)}"`
          : '';
        const title = stat
          ? `${keyLabel(key)} — ${stat.accuracy}% accuracy (${stat.hits} hit / ${stat.misses} miss)`
          : `${keyLabel(key)} — no data yet`;
        return `<span class="${classes}"${style} title="${title}" tabindex="0" aria-label="${title}">${keyLabel(key)}</span>`;
      })
      .join('');
    return `<div class="heatmap-row">${keysHtml}</div>`;
  }).join('');

  el.keyboardHeatmap.innerHTML = rowsHtml;
  if (el.heatmapHint) {
    el.heatmapHint.textContent = hasData
      ? 'Colored green (accurate) to red (error-prone). Hover or focus a key for exact counts.'
      : 'Complete a test to start building your per-key accuracy map.';
  }
}
