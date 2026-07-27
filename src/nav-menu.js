/**
 * Collapsible nav menu (≤640px). Replaces the old `display:none` nav-links
 * dead-end: the menu button toggles #navMenu open, making Guide / About /
 * every growth page reachable on mobile. On desktop the menu is always
 * visible and the button is hidden (pure CSS).
 *
 * Shared by the app (src/main.js) and the static growth pages
 * (src/growth-page.js).
 */

export function initNavMenu() {
  const toggle = document.getElementById('navMenuToggle');
  const menu = document.getElementById('navMenu');
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('open', open);
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // Choosing a link closes the sheet so it never lingers over content.
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) {
      setOpen(false);
      toggle.focus();
    }
  });
}
