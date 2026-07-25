# Metrics v2 — correction-aware counting and legacy data migration

Status: implemented on `feat/v3-typesprint-p0` (Wave 2 P0). Locally verified via unit + integration tests.

## Why v2 exists

The product promise is "measure typing accurately". The pre-v2 input counter
(`computeInputDelta` in `src/session.js`) made that promise false:

- **Every input event** incremented `totalChars` — including backspaces.
- A backspace compared `typed[typed.length - 1] === target[typed.length - 1]`
  on the now-shorter string, so it usually **counted as a correct char**
  (clearing the input compared `undefined === undefined`, always "correct").
  Corrections therefore **inflated accuracy and net WPM**; a type/backspace
  loop could farm unlimited WPM.
- Typing past the end of the passage lowered accuracy (uncounted `totalChars`)
  **without incrementing the Errors stat**, so the numbers didn't reconcile.

## v2 counting model ("first strike")

Every position of the target text is scored **exactly once** — on the first
forward keystroke that reaches it (tracked via `state.maxTypedLength`):

| Event | totalChars | correctChars | errors |
|---|---|---|---|
| Forward keystroke, new position, matches target | +1 | +1 | 0 |
| Forward keystroke, new position, wrong char | +1 | 0 | +1 |
| Forward keystroke past passage end (overflow) | +1 | 0 | +1 |
| Backspace / deletion (correction event) | 0 | 0 | 0 |
| Retype of an already-scored position after a correction | 0 | 0 | 0 |
| Multi-char forward jump (paste / IME commit) | +1 per new position | per-position | per-position |

Consequences:

- Backspaces never inflate accuracy or WPM.
- A typed-then-corrected wrong char keeps its original error — corrections
  cost you the error you made; they can't retroactively erase it.
- Type/backspace loops add nothing (the position is already scored).
- Errors now reconciles with accuracy: overflow chars count as errors.
- WPM formulas themselves are unchanged (raw = totalChars/5/min,
  net = correctChars/5/min, standard 5-chars-per-word convention);
  only the *counting of inputs* changed.

IME/composition input is guarded separately: input events fired during an
active composition (`compositionstart` → `compositionend`) are not scored;
the committed string is scored once at `compositionend`. Because scoring is
position-based, a trailing post-composition input event (Safari ordering)
cannot double-count. Full IME pipeline work is Wave 3.

## Result/stats tagging

- New history entries carry `metricsVersion: 2`.
- Entries **without** the field are pre-v2 results measured with the
  inflated counting.
- The stats object (`typesprint:v1:stats`) carries `metricsVersion: 2`
  after migration.

## Migration of legacy data

Runs once in `migrateStatsToV2()` (`src/history.js`), invoked from
`loadPersistedData()` at startup, and persists the result:

- `stats.bestWPM` (pre-v2) is **archived as `stats.legacyBestWPM`** and the
  active personal best restarts at 0. Rationale: the legacy best was
  measured with inflated counting and must not remain the active PB a v2
  result is compared against. The archived value is retained in storage
  (and survives export/import) but is not shown as the current best.
- `stats.tests` is kept as-is (a completed test is a completed test).
- **Old history entries are left untouched** — no keystroke-level data was
  stored, so their WPM/accuracy cannot be recomputed under v2. They remain
  in history/dashboard displays, distinguishable by the absence of
  `metricsVersion`. The progress dashboard's "best" panels derive from
  history and may therefore still reflect pre-v2 numbers until enough v2
  history accumulates; this is a known, documented mixed-history display.
- Export/import: `sanitizeStats` / `sanitizeHistoryEntry` preserve
  `legacyBestWPM` and a literal `metricsVersion: 2` tag (anything else is
  dropped), so v2 backups round-trip intact and pre-v2 backups are archived
  by the load-time migration after import.

## What users will see

After updating, the "Best WPM" stat resets to 0 and rebuilds from honest v2
results. The previous best is preserved in stored data as `legacyBestWPM`.
This is intentional: the old number was inflated and not comparable.
