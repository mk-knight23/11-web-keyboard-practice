# DESIGN_BASELINE — MK-TypeSprint

Date: 2026-07-23. Method: full read of the inline design system in `index.html` (~990 lines CSS), a11y-relevant modules (`keyboard.js`, `focus-trap.js`, `heatmap.js`), and the wave-2 audit trail (`docs/release-reports/DESIGN_ACCESSIBILITY_AUDIT.md`, CHANGELOG 2.4). No live cross-browser pass in this audit.

## Design system (as implemented)

- **Language:** glassmorphism ("inspired by dash06"), violet/pink gradient accents.
- **Tokens:** proper CSS-variable system — brand (`--primary #8b5cf6`, `--accent #ec4899`), semantic (success/error/warning), surfaces (glass rgba layers + blur), text tiers (primary/secondary/muted), radii scale (12–28px + full), shadow scale, two font stacks (Inter UI / JetBrains Mono for typing surfaces).
- **Theming:** light + dark via `[data-theme]` with full token overrides; system-preference default; persisted choice. ✅
- **Layout:** nav + hero + stats panel + test card + history/heatmap + guide/about sections + results modal + footer. Sections are JS-toggled pages (`showSection`), not routes.

## Accessibility state (strong baseline — recently audited to WCAG 2.2 AA)

Verified in code + covered by passing tests:
- Space-to-start guarded so it never hijacks focused controls (`shouldStartOnSpace`, integration-tested).
- Escape aborts a running test → no keyboard trap in the typing input; focus restored to Start (`resetGame`).
- Results modal: `role="dialog"` + `aria-modal`, focus moves to primary action, Tab trapped (`focus-trap.js`), focus returned on close.
- Contrast: `--text-muted` corrected both themes (4.63:1 / 6.25:1); heatmap key labels pick black/white per background luminance guaranteeing ≥4.5:1 (`heatLabelColor`, numerically swept in tests).
- Reduced motion: `@media (prefers-reduced-motion)` present in CSS.
- Inputs have `aria-label`s; `#weakKeyInfo` is `aria-live="polite"`; skip-to-content link present at top of body.

## Gaps for V3

1. **IME/composition input is unsupported** — beyond metrics (see BROKEN_FEATURE_INVENTORY #2), composing users get visually incoherent per-char feedback. Detect composition and pause per-char judgment.
2. **Correct/incorrect state is nearly color-only** — `.char.correct` green vs `.char.incorrect` red + wavy underline. The underline helps (non-color cue ✅) but correct-state has no non-color cue; low-vision users must rely on hue for "correct". Acceptable under 1.4.1 (underline distinguishes error) — keep the wavy underline through any restyle.
3. **`#message` toast has `role="alert"` + `aria-live="polite"`** — conflicting semantics (alert implies assertive). Pick one (status/polite fits these messages).
4. **Timer countdown has no accessible announcement** — `#timerValue` mutates silently; screen-reader users get no time warning. Add a polite live region announcing at 30/10/5s. Esc-abort partially mitigates WCAG 2.2.1 (timing adjustable); a "no-timer/zen" real mode would fully satisfy it (currently zen is marketing fiction).
5. **Heatmap keys are focusable `<span tabindex="0">` with `aria-label` but no role** — focusable static elements confuse SR interaction models. Prefer a described list/grid (`role="img"` per key or a table) and drop tabindex in favor of a visible data table alternative.
6. **Nav links are `<a href="#" onclick=…>`** — activate as links but navigate nowhere real (also SEO issue); with real routes (SEO_BASELINE #1) these become genuine links.
7. **`prefers-contrast` / forced-colors not handled** — glassmorphism surfaces (rgba borders on blur) can wash out in Windows High Contrast; add `@media (forced-colors: active)` fallbacks.
8. **Brand color drift** — meta theme-color (blue), manifest theme (teal), CSS primary (violet) disagree; unify on the violet system (see BROKEN_FEATURE_INVENTORY #12).
9. **Word-mode UX**: one word at a time in a large display; modern typing products show a full line/paragraph stream. V3's engine rebuild is the moment to move to a text-stream display (also makes spaces real typed characters — fixes the WPM convention gap).
10. **No empty/loading/error state inventory** — empty states exist for history/heatmap/dashboard ✅; import errors surface via toast ✅; no offline state (app breaks silently without cache if CDN unreachable — SW would fix).

## What to preserve in any V3 restyle

The token architecture, dark/light parity, focus-visible treatments, the tested contrast guarantees (muted text, heatmap labels), reduced-motion support, and the modal focus pattern. These were paid for in wave-2 audits — regression here is the main design risk of V3.
