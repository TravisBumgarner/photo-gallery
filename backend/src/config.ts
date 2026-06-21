import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env relative to this file (src/config.ts or dist/config.js → ../.env),
// NOT the cwd — the NFSN daemon starts the server without cd'ing into the app
// dir, so a cwd-based lookup would silently find no env and fail validation.
dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
});

// Settings every deployment needs.
const base = {
  PORT: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.string().default('production'),
  SESSION_SECRET: z.string().min(1),
  APP_PASSWORD: z.string().min(1),
  CORS_ORIGIN: z.string().min(1),
};

// Both supported targets (this computer, and a box you rsync to like
// NearlyFreeSpeech) serve media from local disk — no object-storage creds.
const localMedia = {
  STORAGE_URL: z.string().optional(), // file://… or unset (legacy ../public)
};

// One variant per deploy target, keyed on BACKEND_SERVER. Validated at boot so a
// half-configured deploy fails immediately with a clear list of what's missing,
// not at the first request.
const schema = z.discriminatedUnion('BACKEND_SERVER', [
  z.object({ ...base, ...localMedia, BACKEND_SERVER: z.literal('localhost') }),
  z.object({ ...base, ...localMedia, BACKEND_SERVER: z.literal('nearlyfreespeech') }),
]);

export type Config = z.infer<typeof schema>;

function loadConfig(): Config {
  // Back-compat: configs written before BACKEND_SERVER existed are local.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BACKEND_SERVER: process.env.BACKEND_SERVER ?? 'localhost',
  };
  const result = schema.safeParse(env);
  if (!result.success) {
    console.error('✖ Invalid backend configuration (backend/.env):');
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join('.') || '(config)'}: ${issue.message}`);
    }
    console.error(
      '  Fix backend/.env (or re-run ./ingest-and-sync --setup), then restart.',
    );
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
