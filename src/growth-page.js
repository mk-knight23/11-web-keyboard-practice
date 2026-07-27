/**
 * Growth-page bootstrap — entry module for the static landing pages
 * (/typing-test, /average-typing-speed, …). First-paint theming is handled
 * by /theme-boot.js (same as the app); this module wires the collapsible
 * mobile nav and runs the analytics bootstrap. No app logic runs here; the
 * typing test itself lives on "/".
 */
import { initAnalyticsLoader } from './analytics-loader.js';
import { initNavMenu } from './nav-menu.js';

initNavMenu();
initAnalyticsLoader();
