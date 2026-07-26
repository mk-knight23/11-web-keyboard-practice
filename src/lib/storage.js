/**
 * Versioned localStorage wrapper. All data is stored under a namespaced key with
 * an explicit schema version to support future migrations.
 */

const NAMESPACE = 'typesprint';
const SCHEMA_VERSION = 1;

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
  if (!isBrowser()) return;
  try {
    const prefix = `${NAMESPACE}:`;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    // ignore
  }
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
  return { version: SCHEMA_VERSION, data };
}

export function importAll(payload) {
  if (!isBrowser()) return false;
  if (!payload || typeof payload !== 'object' || !payload.data) return false;
  if (payload.version !== SCHEMA_VERSION) return false;
  try {
    for (const [name, value] of Object.entries(payload.data)) {
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

export const STORAGE_KEYS = Object.freeze({
  STATS: 'stats',
  HISTORY: 'history',
  THEME: 'theme',
  PER_KEY: 'perKey',
  KEY_LATENCY: 'keyLatency',
  BIGRAM_LATENCY: 'bigramLatency',
});
