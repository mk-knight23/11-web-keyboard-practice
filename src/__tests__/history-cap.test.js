import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Wave 3 history cap lift: the 100-entry ceiling becomes a configurable
 * limit (default 10,000), the history UI windows its rendering behind a
 * "show more" control (verified against a 1,000-entry fixture, with a
 * render-time budget), and export/import round-trips large histories.
 */
const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
const bodyMarkup = html
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script[^>]*><\/script>/g, '');

const HISTORY_KEY = 'typesprint:v1:history';

const ENTRY = (wpm) => ({
  date: '2026-07-20T10:00:00.000Z',
  wpm,
  rawWPM: wpm + 4,
  accuracy: 95,
  time: 60,
  errors: 2,
  mode: 'word',
  difficulty: 'medium',
  metricsVersion: 2,
});

const manyEntries = (n) => Array.from({ length: n }, (_, i) => ENTRY(i + 1));

async function bootApp() {
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  const history = await import('../history.js');
  const dataControls = await import('../data-controls.js');
  const storage = await import('../lib/storage.js');
  await import('../main.js');
  return { history, dataControls, storage };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  delete globalThis.indexedDB;
  vi.restoreAllMocks();
});

describe('configurable history limit (default 10,000)', () => {
  it('defaults to 10,000 entries', async () => {
    const { history } = await bootApp();
    expect(history.DEFAULT_HISTORY_LIMIT).toBe(10000);
    expect(history.getHistoryLimit()).toBe(10000);
  });

  it('trims the oldest entries beyond the configured limit', async () => {
    const { history } = await bootApp();
    history.setHistoryLimit(3);
    history.addHistoryEntry(ENTRY(1));
    history.addHistoryEntry(ENTRY(2));
    history.addHistoryEntry(ENTRY(3));
    history.addHistoryEntry(ENTRY(4)); // newest — pushes ENTRY(1) out
    expect(history.getHistory()).toEqual([ENTRY(4), ENTRY(3), ENTRY(2)]);
  });

  it('keeps exactly 10,000 entries at the default limit', async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(manyEntries(10000)));
    const { history } = await bootApp();
    expect(history.getHistory()).toHaveLength(10000);
    history.addHistoryEntry(ENTRY(99999));
    expect(history.getHistory()).toHaveLength(10000);
    expect(history.getHistory()[0]).toEqual(ENTRY(99999));
  });

  it('ignores invalid limit values', async () => {
    const { history } = await bootApp();
    for (const bad of [0, -5, NaN, Infinity, 'lots', null, 2.5]) {
      history.setHistoryLimit(bad);
      expect(history.getHistoryLimit()).toBe(10000);
    }
  });

  it('sanitizeImportPayload no longer truncates at 100 entries', async () => {
    const { dataControls } = await bootApp();
    const payload = {
      version: 1,
      data: { history: manyEntries(150) },
    };
    const clean = dataControls.sanitizeImportPayload(payload);
    expect(clean.data.history).toHaveLength(150);
  });

  it('sanitizeImportPayload caps imports at the active limit', async () => {
    const { history, dataControls } = await bootApp();
    history.setHistoryLimit(50);
    const clean = dataControls.sanitizeImportPayload({
      version: 1,
      data: { history: manyEntries(80) },
    });
    expect(clean.data.history).toHaveLength(50);
  });
});

describe('windowed history rendering (1,000-entry fixture)', () => {
  const renderedRows = () =>
    document.querySelectorAll('#historyList .history-item').length - 1; // minus header

  it('renders only the first window plus a show-more control', async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(manyEntries(1000)));
    const { history } = await bootApp();

    expect(renderedRows()).toBe(history.HISTORY_PAGE_SIZE);
    const more = document.querySelector('[data-history-show-more]');
    expect(more).not.toBeNull();
    expect(more.textContent).toContain(
      String(1000 - history.HISTORY_PAGE_SIZE)
    );
  });

  it('re-render of the 1,000-entry fixture stays inside the frame budget', async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(manyEntries(1000)));
    const { history } = await bootApp();

    const t0 = performance.now();
    history.renderHistory();
    const elapsed = performance.now() - t0;
    // Windowed rendering is O(page), not O(history). jsdom is slower than
    // any real browser, so the budget is generous — the unwindowed 1,000-row
    // innerHTML render this guards against is an order of magnitude worse.
    expect(elapsed).toBeLessThan(250);
    expect(renderedRows()).toBe(history.HISTORY_PAGE_SIZE);
  });

  it('show-more reveals the next window and keeps absolute delete indices', async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(manyEntries(1000)));
    const { history } = await bootApp();

    document.querySelector('[data-history-show-more]').click();
    expect(renderedRows()).toBe(history.HISTORY_PAGE_SIZE * 2);

    const buttons = document.querySelectorAll(
      '#historyList button[data-history-index]'
    );
    const last = buttons[buttons.length - 1];
    expect(Number(last.dataset.historyIndex)).toBe(
      history.HISTORY_PAGE_SIZE * 2 - 1
    );
  });

  it('shows no show-more control when everything fits in one window', async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(manyEntries(5)));
    await bootApp();
    expect(renderedRows()).toBe(5);
    expect(document.querySelector('[data-history-show-more]')).toBeNull();
  });

  it('resets the window when the dataset is replaced (import/delete-all)', async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(manyEntries(1000)));
    const { history } = await bootApp();
    document.querySelector('[data-history-show-more]').click();
    expect(renderedRows()).toBe(history.HISTORY_PAGE_SIZE * 2);

    history.loadPersistedData(); // dataset replaced
    history.renderHistory();
    expect(renderedRows()).toBe(history.HISTORY_PAGE_SIZE);
  });
});

describe('export/import round-trips large histories', () => {
  it('1,000 entries survive exportAll -> validate -> sanitize -> importAll -> reload (IndexedDB)', async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(manyEntries(1000)));
    const factory = new IDBFactory();
    globalThis.indexedDB = factory;
    const { storage, dataControls } = await bootApp();
    expect(storage.getHistoryBackend()).toBe('indexeddb');

    const dump = storage.exportAll();
    expect(dump.data.history).toHaveLength(1000);

    expect(dataControls.validateImportPayload(dump)).toEqual({ ok: true });
    const clean = dataControls.sanitizeImportPayload(dump);
    expect(clean.data.history).toHaveLength(1000);

    storage.clearAll();
    expect(storage.readHistory()).toEqual([]);
    expect(storage.importAll(clean)).toBe(true);
    expect(storage.readHistory()).toHaveLength(1000);
    await storage.flushHistoryWrites();

    // Reload: the imported large history is really in IndexedDB.
    localStorage.clear();
    const second = await bootApp();
    expect(second.history.getHistory()).toHaveLength(1000);
  });
});
