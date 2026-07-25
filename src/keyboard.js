/**
 * Pure predicates for the global document keydown handler in main.js.
 * Extracted so the accessibility guard logic (WCAG 2.1.1 / 2.1.2 / 2.1.4) is
 * unit-testable without a live DOM, and so no single-key shortcut can fire
 * while the user is typing in an editable control.
 */

/** Selector for surfaces that consume typed characters. */
const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * True when the element is (or is inside) a text-entry surface, so single-key
 * shortcuts must not hijack the keystroke.
 * @param {EventTarget | null} element
 * @returns {boolean}
 */
export function isEditableTarget(element) {
  if (!element || typeof element.closest !== 'function') return false;
  return Boolean(element.closest(EDITABLE_SELECTOR));
}

/**
 * Space starts a test ONLY when nothing interactive is focused (focus is on
 * document.body) and the Start button is enabled. This keeps Space available
 * for activating focused buttons/links and for page scrolling. (WCAG 2.1.1)
 * @param {{ key: string, activeElement: Element | null, body: Element, startDisabled: boolean }} args
 * @returns {boolean}
 */
export function shouldStartOnSpace({
  key,
  activeElement,
  body,
  startDisabled,
}) {
  return key === ' ' && activeElement === body && !startDisabled;
}

/**
 * Escape aborts an in-progress test, giving keyboard users a way out of the
 * typing input (WCAG 2.1.2 — no keyboard trap). Escape is intentionally NOT
 * guarded against editable targets: the input is exactly where the user is
 * trapped, so the abort must work from inside it.
 * @param {string} key
 * @param {boolean} isRunning
 * @returns {boolean}
 */
export function shouldAbortOnEscape(key, isRunning) {
  return key === 'Escape' && isRunning === true;
}
