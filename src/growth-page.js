/**
 * Growth-page bootstrap — entry module for the static landing pages
 * (/typing-test, /average-typing-speed, …). Stamps the persisted theme so
 * the pages honor the same preference as the app, and runs the analytics
 * bootstrap. No app logic runs here; the typing test itself lives on "/".
 */
import { initAnalyticsLoader } from './analytics-loader.js';
import { read, STORAGE_KEYS } from './lib/storage.js';

const saved = read(STORAGE_KEYS.THEME, null);
const isValidTheme = saved === 'dark' || saved === 'light';
const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme = isValidTheme ? saved : systemDark ? 'dark' : 'light';
document.documentElement.setAttribute('data-theme', theme);

initAnalyticsLoader();
