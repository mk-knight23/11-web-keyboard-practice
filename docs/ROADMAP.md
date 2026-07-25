# MK TypeSprint — Roadmap

Short, honest list of planned work. Nothing here is shipped until it appears
in the README "What actually ships today" section and is verified in
production.

## Near term

- Extract the ~990 lines of inline CSS from `index.html` into stylesheets
  (prerequisite for additional landing/guide pages).
- Wire the consistency metric — the formula already exists in
  `src/lib/typing-metrics.js` (`calculateConsistency`) but the input pipeline
  does not yet record keystroke timestamps.
- Full IME support (per-keystroke fidelity for composed input; a composition
  guard that prevents miscounting already ships).

## Later

- New content/modes: numbers, punctuation, zen mode, custom test durations
  and word counts.
- Adaptive weak-key practice improvements (real-word generation with
  explained, deterministic recommendations).
- Multilingual word banks.

## Explicit non-goals for now

- Accounts, cloud sync, or any server-side storage — data stays in the
  browser.
- Framework migration — the app stays vanilla ES modules.
