#!/usr/bin/env tsx
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

// The wizard's "Create" choice is the confirmation for the destructive wipe;
// let clear-local-db skip its interactive typed prompt.
process.env.OI_FORCE = '1';

const { waitUntilExit } = render(<App />);
waitUntilExit().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
