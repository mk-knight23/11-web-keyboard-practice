/**
 * Progress dashboard: personal records, practice-minutes total, and a WPM
 * trend sparkline (inline SVG, no chart library). Everything is derived
 * from the real stored history/stats.
 */
import { el } from './ui.js';
import { getHistory, getStats } from './history.js';

const SPARKLINE_SESSIONS = 20;
const SPARK_WIDTH = 260;
const SPARK_HEIGHT = 48;
const SPARK_PAD = 4;

/**
 * Pure: map values to "x,y x,y ..." polyline points inside a
 * width x height viewBox (padded). Returns '' for fewer than 2 values.
 * @param {number[]} values — chronological (oldest first)
 */
export function buildSparklinePoints(
  values,
  width = SPARK_WIDTH,
  height = SPARK_HEIGHT
) {
  if (!Array.isArray(values) || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - SPARK_PAD * 2;
  const innerH = height - SPARK_PAD * 2;
  return values
    .map((v, i) => {
      const x = SPARK_PAD + (i / (values.length - 1)) * innerW;
      const y = SPARK_PAD + innerH - ((v - min) / span) * innerH;
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(' ');
}

/** Pure: total practice minutes from history entries (entry.time is seconds). */
export function totalPracticeMinutes(history) {
  if (!Array.isArray(history)) return 0;
  const seconds = history.reduce(
    (sum, entry) => sum + (Number.isFinite(entry?.time) ? entry.time : 0),
    0
  );
  return Math.round(seconds / 60);
}

/** Pure: highest accuracy seen across history. */
export function bestAccuracy(history) {
  if (!Array.isArray(history) || history.length === 0) return 0;
  return history.reduce(
    (best, entry) =>
      Math.max(best, Number.isFinite(entry?.accuracy) ? entry.accuracy : 0),
    0
  );
}

/** Render the progress card. Hidden until at least one test exists. */
export function renderDashboard() {
  if (!el.progressDashboard) return;
  const history = getHistory();
  const stats = getStats();

  if (history.length === 0) {
    el.progressDashboard.classList.remove('show');
    return;
  }
  el.progressDashboard.classList.add('show');

  // History is newest-first; sparkline wants chronological order.
  const recent = history.slice(0, SPARKLINE_SESSIONS).reverse();
  const points = buildSparklinePoints(recent.map((e) => e.wpm));
  const sparkline = points
    ? `<svg class="spark" viewBox="0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}" role="img" aria-label="WPM trend across your last ${recent.length} sessions" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="var(--mk-data-1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : '<p class="dash-hint">Complete one more test to see your WPM trend.</p>';

  el.progressDashboard.innerHTML = `
    <div class="dash-header">
      <h3>Your Progress</h3>
      <span class="dash-sub">Last ${recent.length} session${recent.length === 1 ? '' : 's'}</span>
    </div>
    ${sparkline}
    <div class="dash-records">
      <div class="dash-record"><span class="dash-value">${Number(stats.bestWPM) || 0}</span><span class="dash-label">Best WPM</span></div>
      <div class="dash-record"><span class="dash-value">${bestAccuracy(history)}%</span><span class="dash-label">Best Accuracy</span></div>
      <div class="dash-record"><span class="dash-value">${Number(stats.tests) || 0}</span><span class="dash-label">Tests Taken</span></div>
      <div class="dash-record"><span class="dash-value">${totalPracticeMinutes(history)}</span><span class="dash-label">Practice Minutes</span></div>
    </div>
  `;
}
