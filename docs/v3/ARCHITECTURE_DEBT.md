# ARCHITECTURE_DEBT — MK-TypeSprint (V3 readiness)

Date: 2026-07-23. Scope: what must be restructured for V3 (modular typing engine, per-key analytics, adaptive engine, IndexedDB history, AI coach gateway), and whether a framework migration is justified.

## Verdict on framework migration: **NOT justified. Stay vanilla ES modules.**

Evidence:
- Total application JS is ~1,700 lines across 16 small modules (largest: `content.js` at 501 lines, mostly data). No module violates the 800-line rule; only `index.html` (1,527 lines) does.
- Zero runtime dependencies. Build output is 32 kB JS / 13.8 kB HTML gzip-total ~26 kB — a React/Vue baseline would multiply this.
- 176 passing tests including a real-markup jsdom integration suite already pin the engine's behavior. A rewrite discards that safety net and risks destroying a stable, production-verified typing engine for zero user-visible gain.
- The pure/impure split is already correct: `lib/typing-metrics.js` and `lib/storage.js` are DOM-free; DOM access is centralized in `ui.js`; `main.js` is the only side-effectful entry.

V3's features (per-key analytics, adaptive engine, IndexedDB, AI gateway) are engine/data problems, not view-layer problems. The modernization path stated in README ("no framework migration; extraction into modules") is correct — keep it.

## Debt register (modules needing restructure, in priority order)

### D1. `src/session.js` — input pipeline rebuild (the V3 core task)
The counting layer (`computeInputDelta`) deliberately mirrors the legacy inline script, including its bugs (backspace counted as a correct char; overflow chars not counted as errors; no timestamps; no IME awareness). Restructure into a proper keystroke event model:
- Count on `beforeinput`/`keydown` semantics, not raw `input` events; classify insert/delete/composition.
- Record `{key, target, correct, tMs}` per keystroke → enables consistency metric, per-key latency, and honest raw/net WPM.
- Track corrected vs uncorrected errors so net WPM can follow a documented convention.
- Guard composition (`isComposing`, `compositionstart/end`).
Existing pure helpers (`extractKeystroke`) and `state` shape are salvageable; the parity tests must be **retired deliberately** (they exist to pin legacy behavior) and replaced with correctness tests.

### D2. `index.html` — 1,527-line monolith
~990 lines of inline CSS + all page content + SEO schema in one file. Extract CSS to `src/styles/` (Vite will bundle/hash it, enabling cache separation from HTML); optionally split guide/about content into JS-injected templates or prerendered sections. CHANGELOG already flags "CSS intentionally remains inline this wave" — V3 is the wave to pay this down.

### D3. `src/lib/storage.js` — IndexedDB adapter for history
localStorage is fine for theme/settings; it is wrong for unbounded history (100-entry cap, ~5 MB origin quota, synchronous, silently evictable). Plan:
- Keep the current API surface (`read/write/exportAll/importAll`) for small keys.
- Add an async `historyStore` (IndexedDB, e.g. hand-rolled ~100-line wrapper — no dependency needed) with migration from `typesprint:v1:history`.
- Surface write failures to the UI (today `write()` returns are ignored everywhere — silent data loss).
- Bump export schema to v2 with explicit migration for v1 payloads.

### D4. `src/lib/typing-metrics.js` — keep, extend
The right seam already exists. Wire `intervalsMs` from D1 timestamps (consistency metric is currently dead code); add per-key latency stats alongside hit/miss; document the chosen net-WPM convention in one place. `findWeakestKeys` already serves the adaptive engine.

### D5. Adaptive engine — grow from `practice.js` + `content.js`
Weak-key mode is a real seed (persisted aggregate → weakest 3 letters → 75% biased pool). V3 adaptive engine needs: bigram-level stats (data model change in `heatmap.js` aggregate), spaced repetition of weak patterns, difficulty progression, and the unused `generateWeakKeyText` (full-text generation) either wired or deleted. Keep generators pure/seeded as they are — the rng-injection pattern is good.

### D6. AI coach gateway
Nothing exists (honestly labeled). Constraint: a static Vite site cannot hold API keys — the gateway must be a serverless function (`api/` on Vercel) that receives the local summary/per-key data and returns coaching text. Never put `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` in `VITE_*` vars (they compile into the client bundle). `.env.example` placeholders currently use non-VITE names — correct; keep it that way. Verify SDK/model names against current provider docs before wiring.

### D7. Miscellaneous debt
- `src/sanitize.js`: fix `ALLOWED_MODES` (`'time'` not `'timed'`; drop `'zen'` until real); defaulting unknown modes/difficulties silently mutates data — prefer rejecting the entry.
- `src/ui.js:showSection`: matches nav links by `textContent.includes()` — breaks on copy change; use `data-section` attributes. `displayWord` hand-escapes only `< > &`; reuse `escapeHtml`.
- `src/history.js` / `main.js`: inline `onclick="deleteHistoryItem(${i})"` + `window.*` globals — replace with delegated listeners; removes the last innerHTML-adjacent event surface.
- Per-mode personal bests: either implement (`stats.bestWPM` → `{[mode]: best}` with migration) or fix the About-page claim.
- Delete dead artifacts: `firebase.json`, `typing1-ss.png`, `usageBytes`/`STORAGE_KEYS.SETTINGS` (or wire them), `.evolution/`, and the ~80 `*_1_1_1*.md` duplicate docs (keep `docs/release-reports/`, `ARCHITECTURE.md`, `ANALYTICS.md`, `PRIVACY.md`).
- `package.json` name `11-web-keyboard-practice` vs product name; `dist/` is gitignored but present locally (fine).
- Fix the production SPA rewrite (or drop the rewrite and accept single-URL SPA — but then remove the config that claims otherwise). If guide/about SEO matters, prerender them as real routes instead (see SEO_BASELINE.md).

## What must NOT be touched carelessly
- `src/lib/typing-metrics.js` pure functions and their 23+ unit tests — extend, don't rewrite.
- The a11y layer (`keyboard.js`, `focus-trap.js`, Esc-abort, Space-guard) — recently audited to WCAG 2.2 AA and covered by tests.
- The import sanitization chain (`data-controls.js` → `sanitize.js`) — closed a real stored-XSS (PR #9); any new render sink must go through `escapeHtml`.
- The legacy-key migration path (`history.js:migrateLegacyData`) — existing users' data depends on it; V3 adds a second migration on top (v1 → v2/IndexedDB), never replaces it.
