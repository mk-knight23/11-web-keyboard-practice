# MK TypeSprint

**Free, private typing-speed test with WPM tracking, code practice, and progress history. No signup.**

Live: https://11-web-keyboard-practice.vercel.app

MK TypeSprint is a browser typing lab. Start a timed test or word-count test, type, get honest WPM + accuracy + per-key statistics, and watch weak keys emerge over time. Everything stays in your browser — history, personal bests, settings.

## What actually ships today

- Five practice modes: word mode (20-word test), timed mode (15/30/60/120 s), code, quotes, and weak-keys practice.
- Content: common English word banks (easy/medium/hard), curated quotes, and code snippets (JavaScript, Python, TypeScript, SQL).
- Live metrics: raw WPM, net WPM, accuracy, error count — correction-aware counting (metrics v2, see [docs/v3/METRICS_V2.md](docs/v3/METRICS_V2.md)).
- Persistent history, single global personal best, keyboard accuracy heatmap, weak-key targeting, and a progress dashboard.
- Modular typing engine ([`src/lib/typing-metrics.js`](src/lib/typing-metrics.js)) with pure functions unit-tested against canonical WPM math.
- Versioned storage layer ([`src/lib/storage.js`](src/lib/storage.js)) with namespaced keys and JSON export/import.
- Analytics: nothing loads unless `VITE_GTM_ID` or `VITE_GA4_ID` is set at build time, or Vercel Analytics is enabled in the dashboard. See [docs/ANALYTICS.md](docs/ANALYTICS.md).

Not shipped (planned — see [docs/ROADMAP.md](docs/ROADMAP.md)): numbers/punctuation content, zen mode, custom durations and word counts, multilingual word banks, consistency metric.

## Tech stack

- Vanilla HTML + CSS + JS (ES modules)
- Vite 7
- Vitest + jsdom
- No framework migration; extraction into modules is the modernization path.

## Getting started

```bash
npm install
npm run dev
npm test
npm run build
```

## Environment variables

Copy `.env.example` to `.env.local` for local dev.

```
VITE_GTM_ID=
VITE_GA4_ID=
```

## Deployment

Deploys to Vercel via Git integration. Framework: Vite (auto). Output: `dist/`.

## Project structure

```
index.html            # markup + inline CSS (CSS extraction planned for Wave 3)
src/
  main.js                   # app orchestrator (event wiring, bootstrap)
  session.js                # test session state machine + input counting
  results.js                # end-of-test flow (summary, persistence, modal)
  history.js                # history/stats persistence + metrics-v2 migration
  heatmap.js, dashboard.js  # per-key heatmap and progress dashboard
  practice.js, content.js   # weak-key practice + word/quote/code banks
  sanitize.js               # import sanitization + HTML escaping
  lib/
    typing-metrics.js       # pure math: WPM, accuracy, consistency, per-key, weakest keys
    storage.js              # versioned localStorage wrapper + export/import
    __tests__/              # unit tests
public/
  robots.txt
  sitemap.xml
  manifest.webmanifest
tests/
  integration.test.js       # boots the real markup + module graph
  setup.js
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).

Built and maintained by [Kazi Musharraf](https://www.mkazi.live) (`mk-knight23`).
