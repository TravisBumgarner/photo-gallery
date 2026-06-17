#!/usr/bin/env tsx
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { resetCleanup, stopServices } from './cleanup.js';
import { migrateConfig } from './configFiles.js';
import { killAll } from './exec.js';

// The wizard already gates Create behind an explicit, count-bearing confirm
// screen (App's 'create-confirm'), and clear-local-db runs non-interactively
// under the step Runner where it can't prompt — so let it skip its own typed
// prompt. Consent lives in the wizard, not here.
process.env.OP_FORCE = '1';

// Tell pipeline tasks they're driven by this UI, so progress.ts emits structured
// status/summary lines the Runner renders (instead of plain-text logging).
process.env.PG_UI = '1';

// Fix configs written under the old Docker model (host.docker.internal → localhost).
if (migrateConfig()) {
  console.log('Updated config: host.docker.internal → localhost (now native).');
}

// Clear any stale services marker so shutdown only stops what THIS run starts.
resetCleanup();

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`ingest-and-sync — photo-gallery orchestrator

Usage:
  ./ingest-and-sync            Run the Source → Process → Sync wizard
  ./ingest-and-sync --setup    Re-run setup (photo folder, model host, storage, password)
  ./ingest-and-sync --help     Show this help

Setup runs automatically on first use. After that, your prompt choices are
remembered — just press enter through them. Config lives in
offline-processing/.cli-cache and backend/.env.`);
  process.exit(0);
}

const forceSetup = args.includes('--setup');

// Graceful shutdown: whatever ends the app — a finished run, a failed step, a
// signal, or an uncaught error — first tears down every spawned task (the
// running pipeline step and/or the label-app server) so nothing is orphaned.
// Idempotent: only the first call does the teardown.
let app: ReturnType<typeof render> | null = null;
let shuttingDown = false;
function shutdown(code: number, headline: string): void {
  if (!shuttingDown) {
    shuttingDown = true;
    // Stop Ink's render loop first (it freezes the last frame), otherwise the
    // messages below get overdrawn by the next redraw.
    app?.unmount();
    console.log(headline);
    killAll(); // running step + label-app server (whole process trees)
    stopServices(); // vision-server + our Ollama; prints a line per service it stops
    console.log('Shutdown complete.');
  }
  process.exit(code);
}

app = render(<App forceSetup={forceSetup} />);

// Register AFTER render: Ink clears existing signal listeners while it mounts, so
// handlers added before render() get silently wiped. During a Runner step no
// input component is mounted (Ink isn't in raw mode), so Ctrl-C lands here as a
// real SIGINT; the waitUntilExit path covers Ink's own (raw-mode) exit.
process.once('SIGINT', () => shutdown(130, '\n⏹  Cancelled (Ctrl-C) — cleaning up…'));
process.once('SIGTERM', () => shutdown(143, '\n⏹  Terminated — cleaning up…'));
process.once('SIGHUP', () => shutdown(129, '\n⏹  Hang-up — cleaning up…'));
process.on('uncaughtException', (err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  shutdown(1, '\n✖  Unexpected error — cleaning up…');
});
process.on('unhandledRejection', (err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  shutdown(1, '\n✖  Unexpected error — cleaning up…');
});

app
  .waitUntilExit()
  .then(() => shutdown(0, '\n✓  Done — cleaning up…'))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    shutdown(1, '\n✖  A step failed — cleaning up…');
  });
