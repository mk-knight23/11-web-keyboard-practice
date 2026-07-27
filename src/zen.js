/**
 * Zen mode — data-focus="zen" on <html> hides all chrome (nav, hero,
 * stats, settings, history, content cards, footer) via pure CSS; only the
 * typing well and its controls remain, vertically centered.
 *
 * Keyboard contract (decided + documented):
 * - `Z` toggles zen ONLY when focus is not on an editable target (see
 *   keyboard.isEditableTarget) and no modifier is held. During an active
 *   test focus lives in #wordInput, so typing "z" never toggles — there is
 *   no conflict with the typing input. The nav toggle button always works.
 * - `Esc` exits zen LAST in the existing priority chain (results modal
 *   close → abort running test → exit zen), preserving the WCAG 2.1.2
 *   escape behaviors that predate zen. The fixed "esc — exit zen" chip is
 *   the visible affordance.
 *
 * Zen is a transient view state (matching the approved preview): it is not
 * persisted across reloads.
 */
import { el } from './ui.js';
import { track } from './analytics.js';

/** Optional hook invoked when zen is entered (set via initZen). */
let onEnterZen = null;

/** @returns {boolean} true when zen mode is active. */
export function isZen() {
  return document.documentElement.getAttribute('data-focus') === 'zen';
}

/**
 * Enter/exit zen. Entering moves focus to the exit chip (the only visible
 * control besides the test itself); exiting returns focus to the toggle
 * when it was on the chip, so keyboard users are never dropped.
 * @param {boolean} on
 */
export function setZen(on) {
  const root = document.documentElement;
  root.setAttribute('data-focus', on ? 'zen' : 'normal');
  if (el.zenToggle) el.zenToggle.setAttribute('aria-pressed', String(on));
  if (on) {
    if (onEnterZen) onEnterZen();
    if (el.zenExit) el.zenExit.focus();
  } else if (document.activeElement === el.zenExit && el.zenToggle) {
    el.zenToggle.focus();
  }
}

/** User-initiated toggle (button or Z key) — tracked. */
export function toggleZen() {
  const next = !isZen();
  setZen(next);
  track('zen_mode', { enabled: next });
}

/**
 * Wire the nav toggle and the exit chip. Call once at bootstrap.
 * @param {{ onEnter?: () => void }} [opts] — onEnter runs when zen is
 *   entered (the app uses it to switch back to the test section, so zen
 *   never shows an empty About page).
 */
export function initZen({ onEnter } = {}) {
  onEnterZen = typeof onEnter === 'function' ? onEnter : null;
  // Zen is transient by design (matches the approved preview): every
  // bootstrap starts in normal mode, whatever a previous page state left.
  document.documentElement.setAttribute('data-focus', 'normal');
  if (el.zenToggle) el.zenToggle.addEventListener('click', toggleZen);
  if (el.zenExit) el.zenExit.addEventListener('click', () => setZen(false));
}
