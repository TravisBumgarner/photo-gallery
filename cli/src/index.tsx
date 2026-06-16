#!/usr/bin/env tsx
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

// The wizard's "Create" choice is the confirmation for the destructive wipe;
// let clear-local-db skip its interactive typed prompt.
process.env.OI_FORCE = '1';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`ingest-and-sync — photo-gallery orchestrator

Usage:
  ./ingest-and-sync            Run the Source → Process → Sync wizard
  ./ingest-and-sync --setup    Re-run setup (photo folder, model host, storage, password)
  ./ingest-and-sync --help     Show this help

Setup runs automatically on first use. After that, your prompt choices are
remembered — just press enter through them. Config lives in
offline-ingestion/.cli-cache and backend/.env.`);
  process.exit(0);
}

const forceSetup = args.includes('--setup');

const { waitUntilExit } = render(<App forceSetup={forceSetup} />);
waitUntilExit().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
