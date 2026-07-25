/**
 * Theme init + toggle. Persists the choice through the versioned storage
 * layer (legacy raw `theme` values are migrated by history.migrateLegacyData).
 */
import { el } from './ui.js';
import { track } from './analytics.js';
import { read, write, STORAGE_KEYS } from './lib/storage.js';
import { notifySaveFailure } from './history.js';

export function initTheme() {
  const saved = read(STORAGE_KEYS.THEME, null);
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (systemDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  if (!write(STORAGE_KEYS.THEME, next)) {
    notifySaveFailure("Theme preference couldn't be saved — storage may be full");
  }
  updateThemeIcon(next);
  track('theme_changed', { theme: next });
}

function updateThemeIcon(theme) {
  el.sunIcon.style.display = theme === 'dark' ? 'block' : 'none';
  el.moonIcon.style.display = theme === 'dark' ? 'none' : 'block';
}
