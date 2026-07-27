/**
 * Minimal hand-rolled IndexedDB wrapper for the history store — no
 * dependency needed (~80 lines). The whole history array is stored as ONE
 * record: reads/writes stay O(1) transactions, semantics stay identical
 * to the localStorage layer it extends, and migration is a single copy.
 * At the 10,000-entry cap a full write is ~1.5 MB of tiny objects — a few
 * ms to structured-clone, persisted asynchronously off the hot path.
 */

const DB_NAME = 'typesprint';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const HISTORY_RECORD_KEY = 'history';

/**
 * Open (and create/upgrade) the TypeSprint database.
 * @param {IDBFactory} factory — injected for tests; browsers pass
 *   globalThis.indexedDB
 * @returns {Promise<IDBDatabase>} rejects when IndexedDB is broken
 */
export function openHistoryDb(factory) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('IndexedDB open blocked by another connection'));
  });
}

/**
 * Read the persisted history record.
 * @param {IDBDatabase} db
 * @returns {Promise<unknown>} the stored value, or undefined when no
 *   record exists (distinguishes "never migrated" from "empty history")
 */
export function idbGetHistory(db) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      request = tx.objectStore(STORE_NAME).get(HISTORY_RECORD_KEY);
    } catch (err) {
      reject(err);
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Write the full history array as one record. The value is structured-
 * cloned synchronously at put() time, so callers may keep mutating their
 * array afterwards.
 * @param {IDBDatabase} db
 * @param {Array<object>} entries
 * @returns {Promise<void>}
 */
export function idbPutHistory(db, entries) {
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entries, HISTORY_RECORD_KEY);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
}
