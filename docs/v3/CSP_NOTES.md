# Content-Security-Policy — directive rationale

Header set in `vercel.json` for `/(.*)`. Derived from the ACTUAL resource
usage of the built app (audited on `feat/v3-typesprint-p0`), not from a
template.

## Actual usage inventory

- **Inline `<style>` block** (~990 lines, the whole design system) plus many
  inline `style=""` attributes in the markup and in generated HTML
  (history rows, heatmap keys).
- **Inline scripts**: the analytics bootstrap IIFE in `<head>` (executes;
  it is inert unless `VITE_GTM_ID`/`VITE_GA4_ID` are real IDs at build
  time) and two JSON-LD blocks (`type="application/ld+json"` — data, not
  executed, needs no script-src allowance).
- **Inline event handlers**: `onclick=` on the hero CTA and on generated
  history-row delete buttons; `window.deleteHistoryItem`/`window.showSection`
  globals back them.
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
| script-src | 'self' 'unsafe-inline' https://www.googletagmanager.com | app bundle is same-origin; 'unsafe-inline' is REQUIRED today by the analytics bootstrap inline script and the inline onclick handlers; GTM/GA4 loader host for when analytics are enabled |
| style-src | 'self' 'unsafe-inline' https://fonts.googleapis.com | inline design system + style attributes; Google Fonts stylesheet |
| font-src | https://fonts.gstatic.com | Google Fonts binaries (no self-hosted fonts) |
| img-src | 'self' data: | data: favicon/manifest icon; screenshots are same-origin |
| connect-src | 'self' + GA/GTM hosts | GA4 beacons (incl. region endpoints via *.google-analytics.com); inert until analytics IDs are configured |
| object-src | 'none' | no plugins |
| base-uri | 'self' | blocks base-tag hijacking of relative URLs |
| form-action | 'self' | no external form targets exist |
| frame-ancestors | 'none' | clickjacking; header-level equivalent of the existing X-Frame-Options: DENY (kept for older UAs) |

## Known weakness + tightening path (Wave 3)

`'unsafe-inline'` in script-src materially weakens CSP's XSS protection
(the stored-XSS class fixed in PR #9 is exactly what CSP should backstop).
It cannot be dropped yet because of (a) the analytics bootstrap inline
script and (b) inline `onclick` handlers. Wave 3 plan:

1. Move the analytics bootstrap into the bundled module (or hash it
   post-build).
2. Replace inline onclick handlers with addEventListener wiring (already
   the pattern everywhere else in `src/main.js`).
3. Extract the inline CSS (already a Wave 3 prerequisite for growth pages),
   then drop 'unsafe-inline' from style-src too.
4. End state: script-src 'self' + GTM host only.

## Verification

- Locally verified by injecting this exact policy as a
  `<meta http-equiv="Content-Security-Policy">` into the BUILT
  `dist/index.html` and exercising the app in a browser (typing test,
  results modal, theme toggle, history, heatmap): no CSP violations in the
  console, fonts loaded, app fully functional. (`frame-ancestors` is
  ignored in meta injection by spec — it is only enforceable via the real
  header.)
- NOT yet verified on a Vercel deployment: requires a preview deploy
  (Wave 2 completion sequence). Verify with browser devtools + `curl -I`
  that the header is present and the console is violation-free.
