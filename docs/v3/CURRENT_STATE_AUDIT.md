# CURRENT_STATE_AUDIT — MK-TypeSprint (Phase 0 Discovery)

- **Date:** 2026-07-23 (IST) | **Auditor:** Agent 3 — TypeSprint Lead Product Engineer
- **Repo:** `/Users/mkazi/3 Repos/MK-TypeSprint`, branch `master` @ `107527f`, remote `mk-knight23/MK-TypeSprint`
- **Uncommitted local edits present** (`src/keyboard.js`, `src/session.js`, `tests/integration.test.js`) — inspected via `git diff`: **Prettier formatting only, zero behavior change.** Left untouched.
- **Production:** https://11-web-keyboard-practice.vercel.app — live, serving current build (bundle `assets/index-DVeSRPzx.js` matches local `npm run build` output hash).

## Verification pipeline (run locally, this audit)

| Step | Command | Result |
|---|---|---|
| Install | `npm ci` | **PASS** (warnings only: esbuild/fsevents install scripts blocked by allowScripts policy) |
| Lint | `npm run lint` (eslint src tests vite.config.js) | **PASS** — 0 errors |
| Tests | `npm test` (vitest) | **PASS** — 16 files, **176/176 tests passed**, 3.46s |
| Build | `npm run build` (vite 7.3.1) | **PASS** — `dist/index.html` 62.69 kB (gzip 13.76), `dist/assets/index-*.js` 32.11 kB (gzip 11.89). Two benign warnings: `%VITE_GTM_ID%` / `%VITE_GA4_ID%` not defined (intentional — analytics env-gated) |
| Audit | `npm audit` | 10 vulns (1 critical, 7 high) — **all in devDependencies** (vite/vitest toolchain). **Zero runtime dependencies exist**; nothing ships to production. See SECURITY_BASELINE.md |

## Architecture map

Vanilla JS ES modules, Vite build, no framework, no runtime deps. Entry: `index.html` (1,527 lines: ~990 lines inline CSS + all markup/SEO content) → `<script type="module" src="/src/main.js">`.

| Module | Lines | Role |
|---|---|---|
| `src/main.js` | 164 | Orchestrator; the only module with top-level side effects; exposes `window.showSection`, `window.deleteHistoryItem` for inline onclick handlers |
| `src/session.js` | 237 | Test state machine: start/reset, timer, per-input counting (`computeInputDelta`, `extractKeystroke`), live stat updates |
| `src/results.js` | 104 | End-of-test: `summarizeTest`, personal best, history entry, results modal + focus trap |
| `src/lib/typing-metrics.js` | 136 | Pure math: raw/net WPM, accuracy, consistency, per-key stats, weakest keys |
| `src/lib/storage.js` | 130 | Versioned localStorage wrapper (`typesprint:v1:*`), export/import, legacy fallback |
| `src/lib/focus-trap.js` | 78 | Modal Tab trap (WCAG) |
| `src/content.js` | 501 | Word banks (easy/medium/hard), code snippets (JS/Py/TS/SQL), quotes, weak-key word generators |
| `src/history.js` | 167 | History (cap 100) + stats persistence, legacy-key migration, list rendering |
| `src/heatmap.js` | 165 | Per-key aggregate, QWERTY heatmap render, WCAG label-contrast math |
| `src/practice.js` | 60 | Weak-key mode: 3 weakest letter keys (min 3 samples), explainer |
| `src/dashboard.js` | 91 | Sparkline + records from real history |
| `src/data-controls.js` | 154 | Export/Import/Delete-all with validation + sanitization |
| `src/sanitize.js` | 89 | escapeHtml + import-payload rebuilders |
| `src/ui.js` | 127 | DOM registry, section nav, toasts, word renderer |
| `src/keyboard.js` / `theme.js` / `analytics.js` | 50/29/14 | a11y key guards / theme / dataLayer wrapper |

Tests: 13 unit files under `src/__tests__` + `src/lib/__tests__`, plus a real-markup jsdom integration suite (`tests/integration.test.js`) that boots `index.html` and types full sessions.

## Typing engine: where metrics are computed

- **Counting** (`src/session.js:handleInput` → `computeInputDelta`): every DOM `input` event on `#wordInput` increments `totalChars` by 1; last typed char vs target decides correct/error. `extractKeystroke` records per-key hits keyed by the *target* char (backspace/overflow excluded from per-key only).
- **Live stats** (`session.js:176-187`): net WPM = `calculateNetWpm(correctChars, elapsedSec)`, raw WPM, accuracy — updated per input event once elapsed > 0.6s.
- **Final** (`results.js:endTest`): `elapsedSec = (Date.now() - startTime)/1000` (real wall time), `summarizeTest(...)` → modal + history.
- **Formulas** (`src/lib/typing-metrics.js`):
  - `rawWpm = round((totalChars/5) / minutes)`
  - `netWpm = round((correctChars/5) / minutes)`
  - `accuracy = round(correctChars/totalChars × 100)` (capped at total)
  - `consistency = clamp(round((1 − CV(intervalsMs)) × 100))` — **never wired** (no timestamps recorded anywhere; see BROKEN_FEATURE_INVENTORY)
- **Timer** (`session.js:startTimer`): `setInterval(1000)` decrementing `timeLeft`; end fires at 0. Subject to background-tab throttling drift; final WPM stays honest because elapsed uses `Date.now()` deltas, but the visible countdown can desync from wall time.

### Metric-correctness verdict: formulas standard-shaped, **input counting is wrong**

1. **Backspace inflation (HIGH — core-promise bug).** `computeInputDelta` counts **every input event** as a typed char, including deletions, and after a deletion re-compares the now-last char (or `undefined === undefined` on empty input, which the code comment itself admits "counts correct"). Consequences, traced from `session.js:69-79`:
   - Typing `a` → backspace → `a` → backspace … yields +1 `totalChars` **and** +1 `correctChars` per backspace: raw WPM and net WPM roughly **double** while accuracy stays 100%. The metric is trivially gameable and organically inflated for anyone who corrects errors.
   - One corrected error costs 3 counted "chars" (wrong char, backspace, right char) with 2 counted correct — accuracy and WPM both distorted vs. any standard.
   - This is faithfully preserved legacy behavior — `metrics-parity.test.js` proves parity with the old inline script, i.e., the tests **lock in** the bug at the counting layer (the pure formulas themselves are fine).
2. **Net WPM convention.** Standard net WPM = gross − (uncorrected errors ÷ minutes) — a full 5-char word penalty per error. Implementation uses `correctChars/5/min`, i.e., a 1-char (⅕-word) penalty per wrong char, closer to Monkeytype-style "correct-chars WPM". Defensible convention, and the on-page FAQ describes it accurately ("counts only correctly typed characters") — but the JSON-LD FAQ says net WPM "subtracts penalties for mistakes," implying the classical formula. Pick one convention, document it, and make schema/FAQ/README agree.
3. **Overflow typing** (typed longer than target): `totalChars` +1 but neither correct nor error → accuracy drops while the **Errors stat does not increment**. Errors and accuracy can disagree.
4. **Spaces are never typed** (input clears per word/snippet) — WPM excludes inter-word spaces, mildly non-comparable with Monkeytype/10FF numbers. Internal consistency OK.
5. **Consistency** metric: dead code (no `intervalsMs` producer, no UI display).
6. **Tab skip** (`handleWordInputKeydown`) increments `wordsTyped` without typing — can end a word-mode test with near-zero chars; guarded math returns 0s, no crash.
7. **No IME/composition handling** anywhere (`grep composition|isComposing` → zero hits): composition sessions fire multiple `input` events, further corrupting counts for IME users (Japanese/Chinese/Korean, mobile autocorrect).

## Storage schema (localStorage, namespace `typesprint:v1:`)

| Key | Shape | Writer |
|---|---|---|
| `typesprint:v1:history` | array (cap 100) of `{date ISO, wpm, rawWPM, accuracy, time s, errors, mode, difficulty}` | `history.js` |
| `typesprint:v1:stats` | `{tests, bestWPM}` (single global best — **not** per mode) | `history.js` |
| `typesprint:v1:perKey` | `{[char]: {hits, misses, total, accuracy}}` | `heatmap.js` |
| `typesprint:v1:theme` | `'light'|'dark'` | `theme.js` |
| `typesprint:v1:settings` | **defined in STORAGE_KEYS, never used** | — |
| Legacy: `typingHistory`, `typingStats`, `theme` | migrated once, non-destructively | `history.js:migrateLegacyData` |

Fragility: `storage.write()` returns `false` on quota/errors but **every caller ignores the return value** → silent data loss possible; history cap 100 silently discards older progress (dashboard "practice minutes" undercounts long-term); all data evictable with browser storage clearing; no IndexedDB. Export/Import JSON exists (validated + sanitized) but is manual, and the import round-trip **mutates mode values** (see BROKEN_FEATURE_INVENTORY #4).

## Test modes actually implemented

`word` (fixed 20 words — `WORD_MODE_TARGET`), `time` (15/30/60/120s), `code` (JS/Python/SQL/TypeScript, always timed), `quotes` (always timed), `weak` (weak-key practice, real, 75% bias toward 3 weakest letter keys). **No** numbers, punctuation, zen, custom durations, or word-count selection — despite marketing copy (see BROKEN_FEATURE_INVENTORY).

## Production spot-check (2026-07-23, curl + WebFetch)

- `/` → 200, correct title/meta/canonical/OG/JSON-LD, security headers from vercel.json applied (nosniff, DENY, referrer-policy, permissions-policy; Vercel adds HSTS preload).
- Hashed bundle → 200, `cache-control: public, max-age=31536000, immutable` ✅.
- `/robots.txt`, `/sitemap.xml` → 200, match repo ✅.
- **`/guide` and any deep route → 404 `NOT_FOUND`** — the vercel.json SPA rewrite is not taking effect in production (headers from the same file do apply). Low user impact today (sections are JS-toggled, not routed) but the config demonstrably doesn't do what it declares. Details in SEO_BASELINE.md.

## Status summary

Locally verified: install/lint/176 tests/build all green; production serving and healthy except the deep-route rewrite. Core metric pipeline has a real correctness defect (backspace/IME counting) that V3 must fix at `src/session.js` while keeping `src/lib/typing-metrics.js` formulas.
