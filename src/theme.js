/**
 * MK theme engine — "Deep Focus Instrument" (V3).
 *
 * Stamps data-theme / data-motion / data-transparency on <html>, persists
 * the choices as raw strings under the family keys
 * (mk.typesprint.{theme,motion,transparency}.v1), keeps the theme-color
 * meta in sync with the active theme's --mk-bg-page, and wires the nav
 * switcher (3 theme options + reduce-motion / reduce-glass toggles).
 *
 * First paint is handled by /theme-boot.js (classic blocking script, CSP
 * script-src 'self'); this module re-validates on boot and completes the
 * one-time migration from the pre-V3 keys (typesprint:v1:theme, raw
 * legacy `theme`).
 */
import { el } from './ui.js';
import { track } from './analytics.js';
import {
  read,
  readRaw,
  writeRaw,
  STORAGE_KEYS,
  MK_KEYS,
} from './lib/storage.js';
import { notifySaveFailure } from './history.js';

export const THEMES = Object.freeze(['light', 'dark', 'hc']);
const DEFAULT_THEME = 'dark'; // signature theme: Deep Focus dark

/** theme-color follows the active theme's --mk-bg-page. */
const THEME_COLORS = Object.freeze({
  dark: '#0B1220',
  light: '#F3F5F8',
  hc: '#000000',
});

/**
 * Resolve the persisted theme: mk.* family key first, then the pre-V3
 * storage-layer value (which itself falls back to the raw legacy `theme`
 * key), then the signature default.
 * @returns {'light' | 'dark' | 'hc'}
 */
export function resolveInitialTheme() {
  const saved = readRaw(MK_KEYS.THEME);
  if (THEMES.includes(saved)) return saved;
  const legacy = read(STORAGE_KEYS.THEME, null);
  if (legacy === 'light' || legacy === 'dark') return legacy;
  return DEFAULT_THEME;
}

/**
 * Apply a theme: stamp <html>, sync the switcher buttons and theme-color
 * meta, and (optionally) persist. Invalid ids fall back to the default.
 * @param {string} theme
 * @param {{ persist?: boolean, notify?: boolean }} [opts] — persist writes
 *   the mk.* key; notify surfaces a save-failure toast (user actions only).
 */
export function setTheme(theme, { persist = true, notify = true } = {}) {
  const next = THEMES.includes(theme) ? theme : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', next);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[next]);

  if (el.themeButtons) {
    el.themeButtons.forEach((btn) => {
      btn.setAttribute(
        'aria-pressed',
        String(btn.dataset.setTheme === next)
      );
    });
  }

  if (persist && !writeRaw(MK_KEYS.THEME, next) && notify) {
    notifySaveFailure(
      "Theme preference couldn't be saved — storage may be full"
    );
  }
  return next;
}

/**
 * Apply the motion preference. `reduced` mirrors the OS-level
 * prefers-reduced-motion kill-switch via the [data-motion="reduced"]
 * selector in main.css — a wired contract, not a stored boolean.
 * @param {'full' | 'reduced'} motion
 */
export function setMotion(motion, { persist = true } = {}) {
  const next = motion === 'reduced' ? 'reduced' : 'full';
  document.documentElement.setAttribute('data-motion', next);
  if (el.motionToggle) {
    el.motionToggle.setAttribute('aria-pressed', String(next === 'reduced'));
  }
  if (persist) writeRaw(MK_KEYS.MOTION, next);
  return next;
}

/**
 * Apply the transparency preference. `reduced` swaps every glass surface
 * to its solid fallback and hides the page wash (see main.css).
 * @param {'normal' | 'reduced'} transparency
 */
export function setTransparency(transparency, { persist = true } = {}) {
  const next = transparency === 'reduced' ? 'reduced' : 'normal';
  document.documentElement.setAttribute('data-transparency', next);
  if (el.transparencyToggle) {
    el.transparencyToggle.setAttribute(
      'aria-pressed',
      String(next === 'reduced')
    );
  }
  if (persist) writeRaw(MK_KEYS.TRANSPARENCY, next);
  return next;
}

/**
 * Boot-time init: stamp all three attributes from persisted state and wire
 * the switcher controls. Persists only when the mk.* key was absent
 * (silent one-time migration — no toast at boot).
 */
export function initTheme() {
  const migrating = !THEMES.includes(readRaw(MK_KEYS.THEME));
  setTheme(resolveInitialTheme(), { persist: migrating, notify: false });
  setMotion(readRaw(MK_KEYS.MOTION) === 'reduced' ? 'reduced' : 'full', {
    persist: false,
  });
  setTransparency(
    readRaw(MK_KEYS.TRANSPARENCY) === 'reduced' ? 'reduced' : 'normal',
    { persist: false }
  );

  if (el.themeButtons) {
    el.themeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const applied = setTheme(btn.dataset.setTheme);
        track('theme_changed', { theme: applied });
      });
    });
  }
  if (el.motionToggle) {
    el.motionToggle.addEventListener('click', () => {
      const isReduced =
        document.documentElement.getAttribute('data-motion') === 'reduced';
      const applied = setMotion(isReduced ? 'full' : 'reduced');
      track('motion_changed', { motion: applied });
    });
  }
  if (el.transparencyToggle) {
    el.transparencyToggle.addEventListener('click', () => {
      const isReduced =
        document.documentElement.getAttribute('data-transparency') ===
        'reduced';
      const applied = setTransparency(isReduced ? 'normal' : 'reduced');
      track('transparency_changed', { transparency: applied });
    });
  }
}
