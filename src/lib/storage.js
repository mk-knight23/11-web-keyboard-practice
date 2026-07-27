/**
 * Versioned localStorage wrapper. All data is stored under a namespaced key with
 * an explicit schema version to support future migrations.
 *
 * Wave 3 adds a history store behind the same seam: a SYNC in-memory façade
 * with write-behind IndexedDB persistence (endTest runs synchronously from
 * setInterval — the hot path must never await), falling back to plain
 * localStorage writes when IndexedDB is unavailable. See initHistoryStore.
 */
import { openHistoryDb, idbGetHistory, idbPutHistory } from './history-db.js';

const NAMESPACE = 'typesprint';
const SCHEMA_VERSION = 1;

/**
 * MK family keys (V3 design system: `mk.<product>.<domain>.v<N>`), stored
 * as RAW strings — not JSON — to match the family theme-engine contract
 * shared with the first-paint boot script (public/theme-boot.js).
 */
const MK_PREFIX = 'mk.typesprint.';
export const MK_KEYS = Object.freeze({
  THEME: `${MK_PREFIX}theme.v1`,
  MOTION: `${MK_PREFIX}motion.v1`,
  TRANSPARENCY: `${MK_PREFIX}transparency.v1`,
});

/** Raw (non-JSON, non-namespaced) read for the mk.* family keys. */
export function readRaw(storageKey) {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/** Raw (non-JSON, non-namespaced) write for the mk.* family keys. */
export function writeRaw(storageKey, value) {
  if (!isBrowser()) return false;
  try {
    localStorage.setItem(storageKey, value);
    return true;
  } catch {
    return false;
  }
}

function key(name) {
  return `${NAMESPACE}:v${SCHEMA_VERSION}:${name}`;
}

function isBrowser() {
  return typeof localStorage !== 'undefined';
}

export function read(name, fallback = null) {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key(name));
    if (raw === null) {
      const legacy = localStorage.getItem(name);
      if (legacy !== null) return safeParse(legacy, fallback);
      return fallback;
    }
    return safeParse(raw, fallback);
  } catch {
    return fallback;
  }
}

export function write(name, value) {
  if (!isBrowser()) return false;
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(name) {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(key(name));
  } catch {
    // ignore
  }
}

export function clearAll() {
  if (isBrowser()) {
    try {
      const prefix = `${NAMESPACE}:`;
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(prefix) || k.startsWith(MK_PREFIX)))
          keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
  // The IndexedDB-backed history is part of "all local data" too.
  if (historyStore.backend === 'indexeddb') persistHistory([]);
}

export function exportAll() {
  if (!isBrowser()) return { version: SCHEMA_VERSION, data: {} };
  const data = {};
  try {
    const prefix = `${NAMESPACE}:v${SCHEMA_VERSION}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const name = k.slice(prefix.length);
        data[name] = safeParse(localStorage.getItem(k) ?? '', null);
      }
    }
  } catch {
    // ignore
  }
  // Under the IndexedDB backend the localStorage history key is a frozen
  // pre-migration copy — the canonical entries live in the store.
  if (historyStore.backend === 'indexeddb') {
    data[STORAGE_KEYS.HISTORY] = readHistory();
  }
  // The theme preference lives under the mk.* family key since V3; export
  // it under the same `theme` name so old and new backups stay compatible.
  const mkTheme = readRaw(MK_KEYS.THEME);
  if (mkTheme !== null) data[STORAGE_KEYS.THEME] = mkTheme;
  return { version: SCHEMA_VERSION, data };
}

export function importAll(payload) {
  if (!isBrowser()) return false;
  if (!payload || typeof payload !== 'object' || !payload.data) return false;
  if (payload.version !== SCHEMA_VERSION) return false;
  try {
    for (const [name, value] of Object.entries(payload.data)) {
      // History routes through the store: in-memory + write-behind under
      // IndexedDB (a 10k-entry import must not hit the localStorage quota),
      // plain synchronous write under the fallback backend.
      if (name === STORAGE_KEYS.HISTORY) {
        persistHistory(value);
        continue;
      }
      // Theme routes to its V3 home (raw string under the mk.* family key)
      // so an imported preference actually drives the engine.
      if (name === STORAGE_KEYS.THEME && typeof value === 'string') {
        writeRaw(MK_KEYS.THEME, value);
        continue;
      }
      write(name, value);
    }
    return true;
  } catch {
    return false;
  }
}

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/* ============================================
   History store — sync in-memory façade with
   write-behind IndexedDB persistence
   ============================================ */

const historyStore = {
  /** @type {'localstorage' | 'indexeddb'} */
  backend: 'localstorage',
  /** @type {IDBDatabase | null} */
  db: null,
  /** Canonical in-memory entries once the IndexedDB backend is active. */
  entries: /** @type {Array<object> | null} */ (null),
  writeQueued: false,
  writeInFlight: false,
  /** @type {Array<() => void>} */
  flushResolvers: [],
};

let onHistoryWriteError = null;

/**
 * Register the handler invoked when an async (write-behind) history write
 * fails — wired to the Wave 2 save-failure notice by main.js. Kept as a
 * callback to avoid a storage → UI dependency.
 * @param {(err: unknown) => void} fn
 */
export function setHistoryWriteErrorHandler(fn) {
  onHistoryWriteError = typeof fn === 'function' ? fn : null;
}

/**
 * Initialize the history backend. Called ONCE at startup (top-level await
 * in main.js). Prefers IndexedDB; performs a one-time, non-destructive
 * migration of the localStorage history (the old key is kept for one
 * release). Falls back to localStorage when IndexedDB is unavailable or
 * broken — every later call then behaves exactly like the pre-Wave-3 code.
 * @param {{ idbFactory?: IDBFactory }} [opts] — factory injection for tests;
 *   defaults to globalThis.indexedDB
 * @returns {Promise<{ backend: 'localstorage' | 'indexeddb',
 *   migrated: boolean, db: IDBDatabase | null }>}
 */
export async function initHistoryStore(opts = {}) {
  const factory = 'idbFactory' in opts ? opts.idbFactory : globalThis.indexedDB;
  if (!factory) {
    historyStore.backend = 'localstorage';
    return { backend: historyStore.backend, migrated: false, db: null };
  }
  let migrated = false;
  try {
    const db = await openHistoryDb(factory);
    const stored = await idbGetHistory(db);
    if (stored === undefined) {
      // First run on this backend: copy (never move) the localStorage
      // history. The old key stays untouched for one release.
      const legacy = read(STORAGE_KEYS.HISTORY, []);
      const entries = Array.isArray(legacy) ? legacy : [];
      await idbPutHistory(db, entries);
      historyStore.entries = entries;
      migrated = entries.length > 0;
    } else {
      historyStore.entries = Array.isArray(stored) ? stored : [];
    }
    historyStore.db = db;
    historyStore.backend = 'indexeddb';
  } catch {
    // IndexedDB broken (private mode quirks, corrupted DB): stay on the
    // synchronous localStorage path — feature-identical, lower cap.
    historyStore.backend = 'localstorage';
    historyStore.db = null;
    historyStore.entries = null;
  }
  return {
    backend: historyStore.backend,
    migrated,
    db: historyStore.db,
  };
}

/** Current history backend — for QA/reporting. */
export function getHistoryBackend() {
  return historyStore.backend;
}

/**
 * SYNC read of the canonical history. Under IndexedDB the in-memory copy
 * (loaded once at init) is authoritative; otherwise this is the plain
 * localStorage read the app has always done.
 * @returns {Array<object>} may be any JSON shape from localStorage — the
 *   caller (history.js) validates with Array.isArray as before
 */
export function readHistory() {
  if (historyStore.backend === 'indexeddb' && historyStore.entries !== null) {
    return historyStore.entries;
  }
  return read(STORAGE_KEYS.HISTORY, []);
}

/**
 * SYNC persist of the full history. IndexedDB backend: updates the
 * in-memory canonical copy immediately and queues a coalesced
 * write-behind (failures surface via setHistoryWriteErrorHandler).
 * localStorage backend: synchronous write, result returned directly.
 * @param {Array<object>} entries
 * @returns {boolean} false only for a synchronous localStorage failure
 */
export function persistHistory(entries) {
  if (historyStore.backend === 'indexeddb') {
    historyStore.entries = entries;
    queueHistoryWrite();
    return true;
  }
  return write(STORAGE_KEYS.HISTORY, entries);
}

function queueHistoryWrite() {
  historyStore.writeQueued = true;
  void drainHistoryQueue();
}

async function drainHistoryQueue() {
  if (historyStore.writeInFlight) return;
  historyStore.writeInFlight = true;
  try {
    while (historyStore.writeQueued) {
      historyStore.writeQueued = false;
      try {
        await idbPutHistory(historyStore.db, historyStore.entries);
      } catch (err) {
        if (onHistoryWriteError) onHistoryWriteError(err);
      }
    }
  } finally {
    historyStore.writeInFlight = false;
    const resolvers = historyStore.flushResolvers.splice(0);
    for (const resolve of resolvers) resolve();
  }
}

/**
 * Resolves once all queued write-behind persistence has settled
 * (successfully or not). Used by tests and pre-navigation QA hooks;
 * production code never needs to await the hot path.
 * @returns {Promise<void>}
 */
export function flushHistoryWrites() {
  if (!historyStore.writeInFlight && !historyStore.writeQueued) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    historyStore.flushResolvers.push(resolve);
  });
}

export const STORAGE_KEYS = Object.freeze({
  STATS: 'stats',
  HISTORY: 'history',
  THEME: 'theme',
  PER_KEY: 'perKey',
  KEY_LATENCY: 'keyLatency',
  BIGRAM_LATENCY: 'bigramLatency',
});
