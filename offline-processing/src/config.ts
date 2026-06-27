import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { expandHome } from './util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Fixed staging inbox — photos awaiting ingestion live here, then move to the
 * _already_processed archive after ingest. Not a user setting; it's always
 * <repo root>/pending-ingestion. */
export const STAGING_DIR = path.join(ROOT, 'pending-ingestion');

// Most of these come from docker-compose.yml (container paths, run flags); only
// the model host/model/keys originate in .cli-cache, which ./oi creates and fills
// in from its prompts. Secrets are the *_API_KEY fields.
const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  DESTINATION_DIRECTORY: z.string(),
  // Where `publish` writes labels + the fat/slim DB (a file://… dir).
  // Defaults to the local DESTINATION_DIRECTORY.
  STORAGE_URL: z.string().optional(),
  // Ingest-only (used only by index.ts). Default them so non-ingest entrypoints
  // — the label app shares this loadConfig() — don't have to set them. The cli
  // always passes them explicitly via compose, so these defaults never apply there.
  DRY_RUN: z.string().default('false'),
  FILE_TRANSFER_MODE: z.enum(['copy', 'cut']).default('copy'),
  MODEL_SERVER_HOST: z.string().optional(),
  MODEL_SERVER_MODEL: z.string().optional(),
  MODEL_SERVER_API_KEY: z.string().optional(),
  VISION_SERVER_HOST: z.string().optional(),
  VISION_SERVER_API_KEY: z.string().optional(),
  // Optional override for the BGE embedder cache (defaults next to the images).
  MODEL_CACHE_DIR: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  dotenv.config({ path: path.resolve('.cli-cache') });
  return envSchema.parse(process.env);
}

// Derived filesystem locations. All scripts resolve images/thumbnails/model-cache
// from DESTINATION_DIRECTORY (and MODEL_CACHE_DIR) so the same code works whether
// run on the host (../backend/public) or in a container (e.g. /data/public).
export function imagesDir(config: Config): string {
  return path.resolve(config.DESTINATION_DIRECTORY, 'images');
}

export function thumbnailsDir(config: Config): string {
  return path.resolve(config.DESTINATION_DIRECTORY, 'thumbnails');
}

// Storage backend URL for publish. Defaults to the local output dir as a
// file:// URL, so the single-box case needs no extra config.
export function storageUrl(config: Config): string {
  return (
    config.STORAGE_URL ??
    `file://${path.resolve(expandHome(config.DESTINATION_DIRECTORY))}`
  );
}

export function modelCacheDir(config: Config): string {
  return config.MODEL_CACHE_DIR
    ? path.resolve(config.MODEL_CACHE_DIR)
    : path.resolve(
        config.DESTINATION_DIRECTORY,
        '..',
        'models',
        'bge-small-en-v1.5',
      );
}
