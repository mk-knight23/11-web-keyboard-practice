# PERFORMANCE_BASELINE — MK-TypeSprint

Date: 2026-07-23. Method: local `vite build` output, live response-header checks. No Lighthouse run performed in this audit (record as a gap; run one before/after V3 for a comparable score).

## Payload baseline (vite 7.3.1 production build, verified locally and matching live bundle hash `index-DVeSRPzx.js`)

| Asset | Raw | Gzip | Notes |
|---|---|---|---|
| `dist/index.html` | 62.69 kB | 13.76 kB | includes ~990 lines inline CSS + all content sections + JSON-LD |
| `dist/assets/index-*.js` | 32.11 kB | 11.89 kB | entire app, single chunk, ES module |
| Images | 0 | 0 | favicon + manifest icon are inline SVG data URIs |
| **Total first load (own origin)** | ~95 kB | **~26 kB** | excellent |

External: one render-blocking Google Fonts stylesheet (Inter ×7 weights 300–900 + JetBrains Mono ×4 weights) with `preconnect` to both font hosts.

## Caching (verified live)

- `/assets/*` → `cache-control: public, max-age=31536000, immutable` ✅
- `/` (HTML) → `max-age=0, must-revalidate` + etag ✅ correct for HTML
- robots/sitemap/manifest → `max-age=3600` per vercel.json ✅
- CDN: `x-vercel-cache: HIT` observed ✅

## Findings

1. **Inline CSS defeats caching separation** — every HTML change re-ships ~50 kB of CSS that could be an immutable hashed asset. Biggest single perf/maintainability win in V3 (same item as ARCHITECTURE_DEBT D2).
2. **Font weight over-fetch** — 11 font files requested for weights the design barely uses; audit usage and trim to ~4 (e.g. Inter 400/600/800, Mono 400/600). Consider `font-display: swap` is already set via `display=swap` ✅; self-hosting fonts would also remove the only third-party request (privacy + LCP).
3. **Single JS chunk is fine at 32 kB** — do not introduce code-splitting complexity at this size; revisit only if V3 (charts, AI panel) pushes the bundle past ~80 kB gzip, then lazy-load dashboard/AI modules.
4. **Runtime hot path is sound** — per-input work is O(target length) re-render of `displayWord` (word-level targets, ≤ ~90 chars) plus O(1) counters; heatmap/dashboard render only at test end. jsdom integration test types a full 20-word session in ~1.3 s including environment overhead. No observed pathological pattern. V3 keystroke-timestamp recording (push to array) adds O(1) per key — safe.
5. **setInterval timer** — 1 s tick, trivial cost, but throttles in background tabs (correctness note in BROKEN_FEATURE_INVENTORY #7; use elapsed-time recomputation per tick in V3, not decrement).
6. **localStorage writes at test end only** (history + stats + perKey JSON.stringify) — small payloads (history capped 100). IndexedDB move (V3) makes these async and removes jank risk as data grows.
7. **No service worker** — manifest exists (`display: standalone`) but the app is not offline-capable; a tiny SW precaching `/` + hashed assets would make it a true installable PWA. Optional V3 enhancement.

## Baseline numbers to beat in V3

- First-load transfer (own origin): ~26 kB gzip.
- External requests: 3 (fonts CSS + 2 font files typical). Target: 0–1.
- Test-end write latency: synchronous localStorage (sub-ms at current sizes).
- Gap to fill: capture Lighthouse (mobile) LCP/CLS/TBT before V3 work starts, on a throttled profile, for honest before/after.
