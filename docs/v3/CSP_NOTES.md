# Content-Security-Policy — directive rationale

Header set in `vercel.json` for `/(.*)`. Derived from the ACTUAL resource
usage of the built app (audited on `feat/v3-typesprint-p0`), not from a
template.

## Actual usage inventory (updated on `feat/v3-typesprint-growth`)

- **Stylesheet**: the design system now lives in `src/styles/main.css`
  (extracted from the former ~990-line inline `<style>` block) and is
  bundled by Vite into a same-origin hashed asset shared by every page.
  Many inline `style=""` **attributes** remain in the markup and in
  generated HTML (history rows, heatmap keys) — these require
  `'unsafe-inline'` in style-src only.
- **Inline scripts**: NONE executing. The analytics bootstrap moved into
  the bundled module `src/analytics-loader.js` (inert unless
  `VITE_GTM_ID`/`VITE_GA4_ID` are real IDs at build time). The remaining
  inline `<script type="application/ld+json">` blocks are data, not
  executed, and need no script-src allowance.
- **Inline event handlers**: NONE. Nav/footer section links use
  `data-section` + addEventListener wiring in `src/main.js`; history-row
  delete buttons use `data-history-index` + delegation on the list
  container; the hero CTA is wired by id. The
  `window.showSection`/`window.deleteHistoryItem` globals were removed.
- **External requests**: Google Fonts stylesheet (`fonts.googleapis.com`),
  font files (`fonts.gstatic.com`); `www.googletagmanager.com` script +
  `google-analytics.com` beacons ONLY when analytics IDs are configured.
- **Favicon + manifest icon**: inline `data:` SVG URIs.
- No iframes, no workers, no media, no forms posting anywhere, no external
  images.

## Directives

| Directive | Value | Why |
|---|---|---|
| default-src | 'self' | baseline deny; also covers manifest-src |
| script-src | 'self' https://www.googletagmanager.com | app bundle is same-origin; 'unsafe-inline' DROPPED (Wave 2.5) — no executing inline scripts or inline handlers remain; GTM/GA4 loader host for when analytics are enabled |
| style-src | 'self' 'unsafe-inline' https://fonts.googleapis.com | bundled design system is same-origin; 'unsafe-inline' still required by inline style="" attributes (markup + generated history rows/heatmap keys); Google Fonts stylesheet |
| font-src | https://fonts.gstatic.com | Google Fonts binaries (no self-hosted fonts) |
| img-src | 'self' data: | data: favicon/manifest icon; screenshots are same-origin |
| connect-src | 'self' + GA/GTM hosts | GA4 beacons (incl. region endpoints via *.google-analytics.com); inert until analytics IDs are configured |
| object-src | 'none' | no plugins |
| base-uri | 'self' | blocks base-tag hijacking of relative URLs |
| form-action | 'self' | no external form targets exist |
| frame-ancestors | 'none' | clickjacking; header-level equivalent of the existing X-Frame-Options: DENY (kept for older UAs) |

## Tightening status

Done in Wave 2.5 (`feat/v3-typesprint-growth`):

1. ~~Move the analytics bootstrap into the bundled module~~ — done,
   `src/analytics-loader.js` (env ids read via `import.meta.env`, statically
   replaced at build).
2. ~~Replace inline onclick handlers with addEventListener wiring~~ — done
   in `src/main.js` (`data-section` links, delegated history delete,
   hero CTA).
3. ~~Extract the inline CSS~~ — done, `src/styles/main.css`. style-src
   still needs `'unsafe-inline'` because inline `style=""` **attributes**
   remain throughout the markup and in generated HTML; removing those is a
   Wave 3 design-system task.
4. ~~End state: script-src 'self' + GTM host only~~ — SHIPPED in
   `vercel.json`.

Remaining (Wave 3): drop `'unsafe-inline'` from style-src by converting
inline style attributes to classes during the design-system rollout.

## Verification

- Wave 2.5 (`feat/v3-typesprint-growth`): the TIGHTENED policy (script-src
  without 'unsafe-inline') was locally verified by injecting it as a
  `<meta http-equiv="Content-Security-Policy">` into the BUILT
  `dist/index.html` and exercising the app via `vite preview` in a browser:
  hero CTA start, full typing session to the results modal, history render
  + row delete (delegated handler), section nav links, theme toggle — zero
  console errors, zero CSP violations, fonts loaded. (`frame-ancestors` is
  ignored in meta injection by spec — it is only enforceable via the real
  header.)
- The pre-tightening policy had earlier been verified the same way on
  `feat/v3-typesprint-p0`.
- NOT yet verified on a Vercel deployment: requires a preview deploy
  (Wave 2 completion sequence). Verify with browser devtools + `curl -I`
  that the header is present and the console is violation-free.
