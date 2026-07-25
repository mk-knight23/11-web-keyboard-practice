# SEO_BASELINE — MK-TypeSprint

Date: 2026-07-23. Verified live via curl/WebFetch against https://11-web-keyboard-practice.vercel.app.

## What's live and correct

| Item | Status | Evidence (live) |
|---|---|---|
| Title | ✅ | `MK TypeSprint — Typing Speed Test & Practice Platform` |
| Meta description | ✅ present / ⚠️ content | "Free typing speed test. Practice with words, quotes, code, and numbers…" — **"numbers" mode doesn't exist** (truthfulness + potential bounce issue) |
| Canonical | ✅ | `https://11-web-keyboard-practice.vercel.app/` |
| robots meta | ✅ | `index, follow` |
| Open Graph | ⚠️ | og:type/title/description/url/site_name present; **no `og:image`** while `twitter:card=summary_large_image` promises a large image — link shares render without a card image |
| Twitter | ⚠️ | Same missing-image problem |
| JSON-LD | ✅ | `WebApplication` (author/creator Kazi Musharraf, mkazi.live, mk-knight23) + `FAQPage` (3 Q&As, mirrored in visible FAQ — good AEO) |
| robots.txt | ✅ | `Allow: /` + sitemap pointer, 200 |
| sitemap.xml | ✅ | Single URL, lastmod 2026-07-22, 200 |
| hreflang / lang | ✅ | `lang="en"` only (single language) |
| Favicon | ✅ | Inline SVG emoji data URI |
| Verification | — | google-site-verification / msvalidate placeholders commented out (not registered in Search Console by this mechanism) |

## Issues

1. **Deep routes 404 in production (verified):** `GET /guide` → `404 NOT_FOUND` despite `vercel.json` rewrites; only `/` resolves. Guide/About content (substantial, keyword-rich: benchmarks, profession tables, 6-step guide, FAQ) is all rendered inside the single URL as JS-toggled sections. Consequences: (a) that content cannot rank as separate pages; (b) the sitemap can never list it; (c) the rewrite config is dead weight. V3 options: prerender `/guide`, `/about` as real HTML routes (Vite multi-page — best), or fix the rewrite and add History-API routing, or accept single-page SEO and delete the rewrite.
2. **No `og:image`/`twitter:image`.** Add a 1200×630 branded card (repo even has `typing1-ss.png` sitting unused at root — replace with a designed card, not a raw screenshot).
3. **Meta/OG descriptions advertise a nonexistent "numbers" mode** (see BROKEN_FEATURE_INVENTORY). Fix copy or ship the mode.
4. **Domain equity:** canonical is a `*.vercel.app` project URL whose slug (`11-web-keyboard-practice`) doesn't match the brand (MK TypeSprint). A custom domain (e.g. subdomain of mkazi.live) would consolidate branding; requires owner decision — flag only.
5. **Sitemap is single-URL** — fine today; must grow if V3 adds real routes.
6. **Stale GitHub links** on-page point at the old repo slug (`11-web-keyboard-practice`) — works only via GitHub rename redirect.
7. Google Fonts render-blocking stylesheet is the only external request — SEO-adjacent (LCP); see PERFORMANCE_BASELINE.

## Baseline metrics to carry into V3

- Indexable URLs: 1. JSON-LD types: 2. OG completeness: 5/6 core tags (missing image).
- Headers: HSTS preload, nosniff, X-Frame-Options DENY live (good trust signals).
- Content depth on the single URL: FAQ (5 visible Q&As), typing guide, benchmark tables — strong for "typing speed test" long-tail if split into real routes.
