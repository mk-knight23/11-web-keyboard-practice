import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

/**
 * History store: sync in-memory façade + write-behind IndexedDB
 * persistence behind src/lib/storage.js, with localStorage fallback.
 * Fresh module registry + fresh fake IDB factory per test.
 */
let storage;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  storage = await import('../storage.js');
});

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

describe('initHistoryStore — backend selection', () => {
  it('falls back to localStorage when IndexedDB is unavailable', async () => {
    const result = await storage.initHistoryStore({ idbFactory: undefined });
    expect(result.backend).toBe('localstorage');
    expect(storage.getHistoryBackend()).toBe('localstorage');
  });

  it('uses IndexedDB when available', async () => {
    const result = await storage.initHistoryStore({
      idbFactory: new IDBFactory(),
    });
    expect(result.backend).toBe('indexeddb');
    expect(storage.getHistoryBackend()).toBe('indexeddb');
  });
});

describe('non-destructive migration from localStorage', () => {
  it('copies existing localStorage history into IndexedDB and keeps the old key', async () => {
    const legacy = [ENTRY(60), ENTRY(55)];
    localStorage.setItem('typesprint:v1:history', JSON.stringify(legacy));

    const factory = new IDBFactory();
    const result = await storage.initHistoryStore({ idbFactory: factory });

    expect(result.backend).toBe('indexeddb');
    expect(result.migrated).toBe(true);
    expect(storage.readHistory()).toEqual(legacy);
    // Non-destructive: the localStorage copy stays for one release.
    expect(localStorage.getItem('typesprint:v1:history')).not.toBeNull();

    // The copy is really IN IndexedDB: a fresh module instance reading the
    // same factory (no localStorage) sees the migrated entries.
    vi.resetModules();
    localStorage.clear();
    const storage2 = await import('../storage.js');
    const second = await storage2.initHistoryStore({ idbFactory: factory });
    expect(second.migrated).toBe(false);
    expect(storage2.readHistory()).toEqual(legacy);
  });

  it('prefers existing IndexedDB data over the localStorage copy (migration runs once)', async () => {
    const factory = new IDBFactory();
    await storage.initHistoryStore({ idbFactory: factory });
    storage.persistHistory([ENTRY(80)]);
    await storage.flushHistoryWrites();

    // Next boot: localStorage now holds a DIFFERENT (stale) copy.
    vi.resetModules();
    localStorage.setItem('typesprint:v1:history', JSON.stringify([ENTRY(1)]));
    const storage2 = await import('../storage.js');
    await storage2.initHistoryStore({ idbFactory: factory });
    expect(storage2.readHistory()).toEqual([ENTRY(80)]);
  });
});

describe('sync façade + write-behind persistence', () => {
  it('persistHistory returns synchronously and readHistory reflects it immediately', async () => {
    await storage.initHistoryStore({ idbFactory: new IDBFactory() });
    const entries = [ENTRY(70)];
    const accepted = storage.persistHistory(entries);
    expect(accepted).toBe(true);
    // No await needed — the façade is synchronous.
    expect(storage.readHistory()).toEqual(entries);
  });

  it('write-behind lands in IndexedDB after flush', async () => {
    const factory = new IDBFactory();
    await storage.initHistoryStore({ idbFactory: factory });
    storage.persistHistory([ENTRY(72)]);
    await storage.flushHistoryWrites();

    vi.resetModules();
    localStorage.clear();
    const storage2 = await import('../storage.js');
    await storage2.initHistoryStore({ idbFactory: factory });
    expect(storage2.readHistory()).toEqual([ENTRY(72)]);
  });

  it('coalesces rapid writes — the final state wins', async () => {
    const factory = new IDBFactory();
    await storage.initHistoryStore({ idbFactory: factory });
    storage.persistHistory([ENTRY(10)]);
    storage.persistHistory([ENTRY(20)]);
    storage.persistHistory([ENTRY(30)]);
    await storage.flushHistoryWrites();

    vi.resetModules();
    localStorage.clear();
    const storage2 = await import('../storage.js');
    await storage2.initHistoryStore({ idbFactory: factory });
    expect(storage2.readHistory()).toEqual([ENTRY(30)]);
  });

  it('surfaces async write failures through the registered handler', async () => {
    const factory = new IDBFactory();
    const onError = vi.fn();
    storage.setHistoryWriteErrorHandler(onError);
    const result = await storage.initHistoryStore({ idbFactory: factory });
    // Force every subsequent transaction to fail.
    result.db.close();

    expect(storage.persistHistory([ENTRY(50)])).toBe(true); // still sync-accepted
    await storage.flushHistoryWrites();
    expect(onError).toHaveBeenCalled();
    // The in-memory façade still serves the data (non-blocking failure).
    expect(storage.readHistory()).toEqual([ENTRY(50)]);
  });

  it('falls back to synchronous localStorage writes without IndexedDB', async () => {
    await storage.initHistoryStore({ idbFactory: undefined });
    expect(storage.persistHistory([ENTRY(44)])).toBe(true);
    expect(JSON.parse(localStorage.getItem('typesprint:v1:history'))).toEqual([
      ENTRY(44),
    ]);
    expect(storage.readHistory()).toEqual([ENTRY(44)]);
  });
});

describe('exportAll / importAll route history through the store', () => {
  it('exportAll uses the canonical in-memory history under IndexedDB', async () => {
    localStorage.setItem('typesprint:v1:history', JSON.stringify([ENTRY(9)]));
    await storage.initHistoryStore({ idbFactory: new IDBFactory() });
    storage.persistHistory([ENTRY(99)]); // memory + IDB now newer than LS copy
    const dump = storage.exportAll();
    expect(dump.data.history).toEqual([ENTRY(99)]);
  });

  it('importAll routes history into the store (memory + write-behind)', async () => {
    await storage.initHistoryStore({ idbFactory: new IDBFactory() });
    const ok = storage.importAll({
      version: 1,
      data: { history: [ENTRY(33)], stats: { tests: 1 } },
    });
    expect(ok).toBe(true);
    expect(storage.readHistory()).toEqual([ENTRY(33)]);
    expect(storage.read('stats', null)).toEqual({ tests: 1 });
    await storage.flushHistoryWrites();
  });

  it('clearAll clears the IndexedDB-backed history too', async () => {
    const factory = new IDBFactory();
    await storage.initHistoryStore({ idbFactory: factory });
    storage.persistHistory([ENTRY(66)]);
    await storage.flushHistoryWrites();

    storage.clearAll();
    expect(storage.readHistory()).toEqual([]);
    await storage.flushHistoryWrites();

    vi.resetModules();
    localStorage.clear();
    const storage2 = await import('../storage.js');
    await storage2.initHistoryStore({ idbFactory: factory });
    expect(storage2.readHistory()).toEqual([]);
  });
});
