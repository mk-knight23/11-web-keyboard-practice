/**
 * First-paint theme stamping. Loaded as a classic BLOCKING script from
 * `self` (no inline JS — the CSP script-src stays clean) before the
 * stylesheet, so <html> carries data-theme / data-motion /
 * data-transparency / data-focus before anything paints: no theme flash.
 *
 * Reads the family keys (mk.typesprint.<domain>.v1) and falls back to the
 * pre-V3 theme keys (typesprint:v1:theme JSON string, then the original raw
 * `theme` key). The module graph (src/theme.js) re-validates and completes
 * the migration after boot; this script never writes storage.
 */
(function () {
  var root = document.documentElement;

  function get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  var theme = get('mk.typesprint.theme.v1');
  if (theme !== 'light' && theme !== 'dark' && theme !== 'hc') {
    // Pre-V3 fallbacks: typesprint:v1:theme stores JSON ('"dark"'),
    // the original key stored the raw string.
    var legacy = get('typesprint:v1:theme') || get('theme') || '';
    legacy = legacy.replace(/"/g, '');
    theme = legacy === 'light' || legacy === 'dark' ? legacy : 'dark';
  }

  var motion = get('mk.typesprint.motion.v1') === 'reduced' ? 'reduced' : 'full';
  var transparency =
    get('mk.typesprint.transparency.v1') === 'reduced' ? 'reduced' : 'normal';

  root.setAttribute('data-theme', theme);
  root.setAttribute('data-motion', motion);
  root.setAttribute('data-transparency', transparency);
  if (!root.hasAttribute('data-focus')) {
    root.setAttribute('data-focus', 'normal');
  }

  // theme-color follows the active theme's --mk-bg-page.
  var colors = { dark: '#0B1220', light: '#F3F5F8', hc: '#000000' };
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', colors[theme]);
})();
