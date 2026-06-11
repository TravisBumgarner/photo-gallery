import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  SOURCE_DIR: z.string(),
  DESTINATION_DIRECTORY: z.string(),
  INGEST_MODE: z.enum(['local', 'production']),
  DRY_RUN: z.string(),
  FILE_TRANSFER_MODE: z.enum(['copy', 'cut']),
  SSH_HOST: z.string().optional(),
  MODEL_SERVER_HOST: z.string().optional(),
  MODEL_SERVER_MODEL: z.string().optional(),
  MODEL_SERVER_API_KEY: z.string().optional(),
  FACE_SERVER_HOST: z.string().optional(),
  FACE_SERVER_API_KEY: z.string().optional(),
  // Optional override for the BGE embedder cache (defaults next to the images).
  MODEL_CACHE_DIR: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: 'local' | 'production'): Config {
  const envFile = path.resolve(`.env.${env}`);
  dotenv.config({ path: envFile });
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
