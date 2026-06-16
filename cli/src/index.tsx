#!/usr/bin/env tsx
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

const { waitUntilExit } = render(<App />);
waitUntilExit().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
