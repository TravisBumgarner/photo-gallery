import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';
import dotenv from 'dotenv';

dotenv.config();

const sqlite = new Database(process.env.DATABASE_URL || 'sqlite.db');
export const db = drizzle(sqlite, { schema });
