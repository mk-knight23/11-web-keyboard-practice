# SECURITY_BASELINE — MK-TypeSprint

Date: 2026-07-23. Method: full source read, secret grep, `npm audit`, live header check. No secret values appear in this report.

## Posture summary

Static client-only app, **zero runtime npm dependencies**, no backend, no accounts, no cookies, all data in origin-scoped localStorage. Attack surface is intrinsically small. The one historical High (stored XSS via malicious JSON import) was fixed in PR #9 (`b7868b9`) with a validate → sanitize → escape pipeline and is covered by tests (`sanitize.test.js`, 13 passing).

## Secrets

- `grep -rE "(api[_-]?key|secret|token|password|Bearer )"` across src/, index.html, configs: **no hardcoded secrets found.**
- `.env.example` contains empty/commented placeholders only. AI keys are correctly **not** `VITE_`-prefixed (Vite would inline `VITE_*` into the public bundle — keep this rule in V3).
- Analytics IDs (`VITE_GTM_ID`/`VITE_GA4_ID`) are build-time public identifiers, format-validated (`/^GTM-…/`, `/^G-…/`) before script injection — acceptable.
- `.gitignore` covers `.vercel`, `node_modules`, `dist`. No `.env*` pattern in `.gitignore` — **add `.env*` before any real key exists locally** (currently no .env file exists, so exposure is zero today).

## Live headers (verified 2026-07-23)

Present: `strict-transport-security: max-age=63072000; includeSubDomains; preload` (Vercel), `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`.

Missing:
- **Content-Security-Policy** — none. With innerHTML sinks in the codebase (escaped, but defense-in-depth applies), a CSP is the right backstop. Needs allowances for `fonts.googleapis.com`/`fonts.gstatic.com`, `data:` images (favicon/manifest icon), inline styles, and GTM/GA hosts if analytics ever activate. Recommend for V3: `default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.google-analytics.com; frame-ancestors 'none'` (tune after CSS extraction removes the giant inline style block).
- `access-control-allow-origin: *` is served — harmless for a public static page, but remove if an `api/` gateway is added.

## Dependency audit

`npm audit`: 10 advisories (1 critical, 7 high, 1 moderate, 1 low) — **all in devDependencies** (vite dev server, vitest chain: brace-expansion, flatted, form-data, js-yaml, picomatch, postcss, vite 7.3.1 path-traversal/fs.deny advisories, launch-editor). Nothing ships to production (build output is self-contained HTML+JS). Risk is limited to developers running the dev server. `npm audit fix` reportedly resolves all — **not applied in this audit (lockfile is read-only for Phase 0); schedule it as the first V3 chore.** esbuild/fsevents postinstall scripts are blocked by the local allowScripts policy (fine — build works without them on this machine).

## Application-level review

| Area | Finding |
|---|---|
| XSS — history render | `renderHistory` interpolates into innerHTML but every dynamic value passes `escapeHtml`/`Number()` coercion ✅ |
| XSS — import path | `validateImportPayload` → `sanitizeImportPayload` rebuilds records from validated primitives; per-key labels capped at 12 chars, escaped at render ✅ |
| XSS — word display | `displayWord` hand-escapes only `< > &` — sufficient for element-content context, but fragile; unify on `escapeHtml` (content is app-supplied today, not user-supplied) |
| Prototype pollution on import | `importAll` iterates `Object.entries(payload.data)` and writes namespaced keys; sanitizers rebuild objects — no `__proto__` merge sink found ✅ |
| Inline handlers | `onclick="deleteHistoryItem(${i})"` with numeric index + `window` globals — not exploitable, but replace with delegated listeners (removes footgun + enables stricter CSP) |
| Open redirect / URL handling | None — no user-supplied URLs |
| Third-party requests | Google Fonts only (privacy policy discloses it). GTM/GA4 load only when env-configured at build ✅ |
| firebase.json | Dead config (deploys via Vercel); carries deprecated `X-XSS-Protection` header. Delete to avoid confusion/drift |
| Privacy claims | "No data collected / localStorage only" — matches code ✅. `analytics_debug` localStorage flag enables console logging only |
| Storage integrity | Import can overwrite existing data by design (confirm-less) — consider a merge/confirm step in V3; quota failures silent (see BROKEN_FEATURE_INVENTORY #5) |

## V3 security gates

1. AI coach gateway must be serverless-side (keys never in client bundle), with rate limiting and input size caps before any provider key is configured.
2. Add CSP after CSS extraction (inline-style removal makes a strict policy feasible).
3. Run `npm audit fix` and re-lock; add a CI audit step.
4. Add `.env*` to `.gitignore` before any local key is created.
