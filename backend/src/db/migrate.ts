import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

dotenv.config();

const sqlite = new Database(process.env.DATABASE_URL || 'sqlite.db');
const db = drizzle(sqlite);

async function main() {
  console.log('Running migrations...');
  migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete!');
  sqlite.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
