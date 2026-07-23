# BROKEN_FEATURE_INVENTORY — MK-TypeSprint

Date: 2026-07-23. Every item verified against code, tests, or live production. Severity: CRITICAL > HIGH > MEDIUM > LOW.

## Real vs advertised vs mocked

| Feature | Advertised where | Reality | Class |
|---|---|---|---|
| Word mode | README, UI | Real — but **fixed 20 words** (`session.js:WORD_MODE_TARGET`) | REAL (overclaimed) |
| Timer 15/30/60/120s | README, UI, About | Real | REAL |
| "Custom" durations | README line 11 | **Does not exist** — `#timerDuration` has exactly 4 options | ADVERTISED-ONLY |
| Word-count modes "10/25/50/100 + custom" | README line 11 | **Does not exist** — no word-count selector anywhere | ADVERTISED-ONLY |
| Code mode (JS/Py/TS/SQL) | README, UI, guide | Real — 8–12 snippets per language in `content.js` | REAL |
| Quotes mode | README, UI | Real — 14 quotes | REAL |
| "Punctuation, numbers" content | README line 12; meta/OG description ("Practice with words, quotes, code, and numbers") — live in prod today | **No numbers or punctuation generator exists** in `content.js`; no UI mode | ADVERTISED-ONLY |
| "Zen mode" | README line 12; phantom `'zen'` in `sanitize.js:ALLOWED_MODES` | **Does not exist** | ADVERTISED-ONLY |
| Live raw/net WPM + accuracy | README, UI | Real (with counting bug — below) | REAL (buggy) |
| Consistency metric | README line 61 ("pure math: WPM, accuracy, consistency…") | Formula exists in `typing-metrics.js` but **no keystroke timestamps are ever recorded and no UI shows it** — dead code | UNWIRED |
| Keyboard heatmap | README roadmap says "coming"; CHANGELOG 2.4 says shipped | **Real and shipped** (README roadmap is stale in the other direction) | REAL |
| Weak-key adaptive practice | README roadmap "coming" | **Real and shipped** — persisted per-key aggregate → 3 weakest letters → 75% biased word pool, toggle, explainer, seeded-RNG tests | REAL |
| Personal best "per mode" | About page: "Personal best tracking per mode" | **False** — `stats.bestWPM` is one global number (`history.js`, `results.js:55`) | ADVERTISED-ONLY |
| History + export/import/delete | README, UI | Real, validated + sanitized | REAL |
| Progress dashboard (sparkline, records) | CHANGELOG | Real, from stored history | REAL |
| Leaderboards | — | **Not claimed anywhere, none exist** — no fake leaderboard ✅ | N/A |
| AI coach | README roadmap, `.env.example` | Placeholders only, explicitly labeled "not wired yet" — honest | HONEST-PLACEHOLDER |
| Multilingual word banks | README roadmap | Not implemented (roadmap item, honestly framed) | ROADMAP |

## Defects

1. **[CRITICAL] WPM/accuracy counting is inflatable and wrong for corrections** — `src/session.js:computeInputDelta` counts every `input` event (including backspaces) as a typed char, and after deletion the re-comparison (or `undefined === undefined` on empty) counts as **correct**. Type-char/backspace loops double raw+net WPM at 100% accuracy; every genuine correction inflates totals. Parity tests intentionally preserve this legacy behavior. This undermines the product's core promise ("honest WPM").
2. **[HIGH] No IME/composition handling** — no `compositionstart/end` or `isComposing` checks anywhere; each composition step fires `input` events counted as chars. Metrics are meaningless for IME users and can distort on mobile autocorrect.
3. **[HIGH] Production SPA rewrite broken** — verified live: `GET /guide` → `404 NOT_FOUND` (`bom1::…`), same for any non-file path, despite `vercel.json` `rewrites` (headers from the same file do apply). Either the regex source `/((?!api|assets|.*\..*).*)` is not matching under the `framework: "vite"` preset or the config is being partially ignored. Impact: deep links/bookmarks 404; sections are only reachable through in-page JS.
4. **[MEDIUM] Export→import round-trip corrupts history `mode` values** — `sanitize.js:ALLOWED_MODES = {'timed','word','code','quotes','weak','zen'}` but the app writes `mode:'time'` (`session.js`, verified in `integration.test.js:166`). On import, every timed entry fails the allowlist and is coerced to the phantom `'timed'`; `'zen'` is allowed but doesn't exist. Display survives by accident (both hit the fallback branch in `renderHistory`), but stored data mutates on round-trip and unknown difficulties silently become `'easy'`.
5. **[MEDIUM] Silent data loss on storage failure** — `storage.write()` returns `false` on quota/exception; `saveHistory()`, `saveStats()`, `recordSessionPerKey()` all ignore it. A user at quota loses results with a "Test Complete!" success screen.
6. **[MEDIUM] Errors stat vs accuracy disagreement on overflow** — typing past the target length counts `totalChars` (accuracy drops) but never increments `errors` (`computeInputDelta` only assigns errors when `typed.length <= target.length`).
7. **[LOW] Timer countdown drift** — `setInterval(1000)` decrement; throttled background tabs stretch the countdown. Final WPM unaffected (wall-clock elapsed), but "60s test" can exceed 60 real seconds and the displayed countdown desyncs.
8. **[LOW] `README.md` links to `docs/ROADMAP.md` which does not exist** (line 19).
9. **[LOW] Stale GitHub repo links in `index.html`** (lines 1455, 1519): point to `mk-knight23/11-web-keyboard-practice`; the remote is `mk-knight23/MK-TypeSprint` (works only if GitHub keeps the rename redirect).
10. **[LOW] Branding inconsistency** — canonical is "Kazi Musharraf", but `index.html:1436` and `:1521` render "Kazi Musharraf — Kazi Developer" (the "Kazi Developer" tag is a non-canonical variant; live in prod). No instance of "Qazi Musharof"/"Qazi Musharraf" remains outside historical release-report docs. `package.json` name is still `11-web-keyboard-practice` while the product/repo is MK-TypeSprint.
11. **[LOW] Dead code/config** — `calculateConsistency` + `summarizeTest.intervalsMs` path (unwired), `generateWeakKeyText` (exported+tested, never called by app), `usageBytes` (README advertises "storage-usage introspection"; no caller), `STORAGE_KEYS.SETTINGS` (never used), `firebase.json` (project deploys to Vercel; contains deprecated `X-XSS-Protection` header), stray `typing1-ss.png` at repo root, `.evolution/`, `docs/` contains ~80 duplicate junk files (`*_1_1_1_1.md` variants).
12. **[LOW] Manifest/theme color mismatches** — `<meta name="theme-color" content="#3b82f6">` (blue) vs `manifest.webmanifest` `theme_color #0d9488` (teal) vs actual brand primary `#8b5cf6` (violet); manifest `background_color #0b0f14` vs dark bg `#0c1222`.

## Marketing copy that must change or ship

The production meta description, OG description, and Twitter description all promise a **numbers** practice mode that does not exist; README additionally promises punctuation, zen, custom durations, and selectable word counts. Either implement in V3 or correct the copy — this is currently a truthfulness gap on the live site.
