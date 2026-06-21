// Structured progress for the orchestrator UI. The cli's Runner (cli/src/
// Runner.tsx) parses these sentinel lines to show a live status next to the
// running step and a one-line summary once it finishes. Keep the prefixes in
// sync with Runner.tsx.
//
// PG_UI=1 is set by the cli when it drives these tasks. Run a task directly
// (npm run tag) and status() stays quiet while summary() prints plainly, so the
// sentinels never leak into a hand-run terminal.
const STATUS_PREFIX = '@@PG_STATUS@@';
const SUMMARY_PREFIX = '@@PG_SUMMARY@@';
const UI = process.env.PG_UI === '1';

/** Live one-liner for the running step; overwrites the previous. Call freely. */
export function status(text: string): void {
  if (UI) console.log(`${STATUS_PREFIX} ${text}`);
}

/** Final one-liner shown beside the step once done. Call once near the end. */
export function summary(text: string): void {
  console.log(UI ? `${SUMMARY_PREFIX} ${text}` : text);
}

/** Compact human duration for ETAs: "45s", "12m", "1h 3m". */
export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 90) return `${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
