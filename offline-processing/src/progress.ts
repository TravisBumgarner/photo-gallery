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
