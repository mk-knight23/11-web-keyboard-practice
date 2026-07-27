import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * App wiring for the Wave 3 IndexedDB history store: boots the real module
 * graph (src/main.js) with a fake IndexedDB factory on globalThis and
 * verifies main.js/history.js route history through the store — backend
 * activation, write-behind persistence across "reloads" (fresh module
 * registry + same factory), clear-history resurrection safety, and the
 * Wave 2 save-failure notice for async write errors.
 *
 * NOTE: no fake timers here — fake-indexeddb needs the real task queue.
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

/** Boot the real app with the given IDB factory injected as the global. */
async function bootApp(factory) {
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  globalThis.indexedDB = factory;
  const storage = await import('../lib/storage.js');
  const history = await import('../history.js');
  await import('../main.js');
  return { storage, history };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  delete globalThis.indexedDB;
  vi.restoreAllMocks();
});

describe('main.js boots the IndexedDB history backend', () => {
  it('activates IndexedDB and migrates the localStorage history non-destructively', async () => {
    const seeded = [ENTRY(64), ENTRY(58)];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(seeded));

    const factory = new IDBFactory();
    const { storage, history } = await bootApp(factory);

    expect(storage.getHistoryBackend()).toBe('indexeddb');
    expect(history.getHistory()).toEqual(seeded);
    // Non-destructive: the localStorage copy stays for one release.
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY))).toEqual(seeded);
    // And the migrated entries drive the UI.
    expect(
      document.getElementById('historySection').classList.contains('show')
    ).toBe(true);
    expect(document.getElementById('historyList').innerHTML).toContain(
      '<strong>64</strong>'
    );
  });

  it('chains legacy typingHistory -> namespaced -> IndexedDB on first boot', async () => {
    const legacy = [ENTRY(51)];
    localStorage.setItem('typingHistory', JSON.stringify(legacy));

    const factory = new IDBFactory();
    const { storage, history } = await bootApp(factory);

    expect(storage.getHistoryBackend()).toBe('indexeddb');
    expect(history.getHistory()).toEqual(legacy);
    await storage.flushHistoryWrites();

    // Reload with wiped localStorage: the chain landed in IndexedDB.
    localStorage.clear();
    const second = await bootApp(factory);
    expect(second.history.getHistory()).toEqual(legacy);
  });
});

describe('history writes route through the store', () => {
  it('new entries persist via IndexedDB (not localStorage) and survive a reload', async () => {
    const factory = new IDBFactory();
    const { storage, history } = await bootApp(factory);
    expect(storage.getHistoryBackend()).toBe('indexeddb');

    history.addHistoryEntry(ENTRY(77));
    expect(history.getHistory()).toHaveLength(1); // sync facade
    await storage.flushHistoryWrites();

    // The hot path no longer touches localStorage under the IDB backend.
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();

    // Simulated reload: fresh module registry, same IDB factory, no LS.
    localStorage.clear();
    const second = await bootApp(factory);
    expect(second.history.getHistory()).toEqual([ENTRY(77)]);
    expect(
      document.getElementById('historySection').classList.contains('show')
    ).toBe(true);
  });

  it('deleting a single entry persists through the store', async () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([ENTRY(90), ENTRY(80), ENTRY(70)])
    );
    const factory = new IDBFactory();
    const { storage, history } = await bootApp(factory);

    history.deleteHistoryItem(1); // drop ENTRY(80)
    await storage.flushHistoryWrites();

    localStorage.clear();
    const second = await bootApp(factory);
    expect(second.history.getHistory()).toEqual([ENTRY(90), ENTRY(70)]);
  });

  it('clearHistory empties IndexedDB too — a reload cannot resurrect entries', async () => {
    const seeded = [ENTRY(66)];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(seeded));
    const factory = new IDBFactory();
    const { storage, history } = await bootApp(factory);
    expect(storage.getHistoryBackend()).toBe('indexeddb');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    history.clearHistory();

    expect(history.getHistory()).toEqual([]);
    // The frozen pre-migration localStorage copy is dropped on explicit
    // clear so a future backend fallback cannot resurrect deleted data.
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
    await storage.flushHistoryWrites();

    const second = await bootApp(factory);
    expect(second.history.getHistory()).toEqual([]);
  });
});

describe('async write failures reuse the Wave 2 notice', () => {
  it('shows the save-failure message when the write-behind put fails', async () => {
    const factory = new IDBFactory();
    const { storage, history } = await bootApp(factory);
    expect(storage.getHistoryBackend()).toBe('indexeddb');

    // Re-init returns the store's live connection; closing it makes every
    // subsequent write-behind transaction fail.
    const { db } = await storage.initHistoryStore();
    db.close();

    history.addHistoryEntry(ENTRY(42)); // sync facade still accepts it
    expect(history.getHistory()).toEqual([ENTRY(42)]);
    await storage.flushHistoryWrites();

    const message = document.getElementById('message');
    expect(message.textContent).toBe(history.SAVE_FAILURE_MESSAGE);
    expect(message.className).toContain('error');
  });
});
