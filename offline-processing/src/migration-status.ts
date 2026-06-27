import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Drizzle migrations live in the backend package; both this check and `migrate`
// run with CWD = offline-processing, so the relative path resolves the same way.
export const MIGRATIONS_DIR = path.resolve('../backend/drizzle');

// Schema version drift between a database file and the migrations the current
// code ships. Separate axis from the `generation` counter (which tracks data
// freshness): this is about table shape, not how much work the DB holds.
export type MigrationState =
  | 'fresh' // empty/new DB — migrate will create the schema, no prompt needed
  | 'in-sync' // DB has exactly the migrations this code knows
  | 'behind' // DB is missing migrations this code ships — forward-migratable
  | 'ahead'; // DB has migrations this code doesn't — NOT migratable, must abort

export interface MigrationStatus {
  state: MigrationState;
  applied: number; // migrations recorded in the DB
  available: number; // migrations in the codebase journal
  pending: string[]; // tags present in code but not yet applied
  newestApplied: string | null;
  newestAvailable: string | null;
}

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

function readJournal(): JournalEntry[] {
  const p = path.join(MIGRATIONS_DIR, 'meta', '_journal.json');
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    entries: JournalEntry[];
  };
  // Drizzle keys migrations by their `when` (folder millis), applying in that
  // order; sort so "newest" and ">last applied" comparisons are reliable.
  return [...parsed.entries].sort((a, b) => a.when - b.when);
}

/** Compare a database file against the codebase's migrations without touching
 * it (read-only). Returns 'fresh' if the file/schema doesn't exist yet. */
export function readMigrationStatus(dbPath: string): MigrationStatus {
  const journal = readJournal();
  const available = journal.length;
  const newestAvailable = available ? journal[available - 1].tag : null;
  const maxJournalWhen = available ? journal[available - 1].when : 0;
  const freshStatus = (): MigrationStatus => ({
    state: 'fresh',
    applied: 0,
    available,
    pending: journal.map((e) => e.tag),
    newestApplied: null,
    newestAvailable,
  });

  if (!fs.existsSync(dbPath)) return freshStatus();

  const sqlite = new Database(dbPath, { readonly: true });
  try {
    const names = new Set(
      (
        sqlite
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all() as { name: string }[]
      ).map((t) => t.name),
    );
    const hasDrizzle = names.has('__drizzle_migrations');
    const userTables = [...names].filter(
      (n) => !n.startsWith('sqlite_') && n !== '__drizzle_migrations',
    );
    // No drizzle bookkeeping AND no real tables → brand-new empty DB.
    if (!hasDrizzle && userTables.length === 0) return freshStatus();

    const appliedWhens = hasDrizzle
      ? (
          sqlite
            .prepare('SELECT created_at FROM __drizzle_migrations')
            .all() as { created_at: number }[]
        ).map((r) => Number(r.created_at))
      : [];
    const applied = appliedWhens.length;
    const lastApplied = applied ? Math.max(...appliedWhens) : null;

    const pending = journal
      .filter((e) => lastApplied === null || e.when > lastApplied)
      .map((e) => e.tag);
    const newestApplied =
      lastApplied === null
        ? null
        : (journal.filter((e) => e.when <= lastApplied).at(-1)?.tag ?? null);

    let state: MigrationState;
    if (lastApplied !== null && lastApplied > maxJournalWhen) state = 'ahead';
    else if (pending.length === 0) state = 'in-sync';
    else state = 'behind';

    return { state, applied, available, pending, newestApplied, newestAvailable };
  } finally {
    sqlite.close();
  }
}
