import path from 'node:path';
import { loadConfig } from './config.js';
import { readMigrationStatus, type MigrationStatus } from './migration-status.js';
import { expandHome } from './util.js';

// Read-only sibling of `migrate`: report schema drift between the working DB and
// the migrations this code ships, as a single JSON line on stdout. The CLI shells
// out to this (it has no sqlite driver of its own) to decide whether to prompt.

const config = loadConfig();
const status: MigrationStatus = config.DATABASE_URL
  ? readMigrationStatus(path.resolve(expandHome(config.DATABASE_URL)))
  : { state: 'fresh', applied: 0, available: 0, pending: [], newestApplied: null, newestAvailable: null };

process.stdout.write(`${JSON.stringify(status)}\n`);
