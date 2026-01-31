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
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: 'local' | 'production'): Config {
  const envFile = path.resolve(`.env.${env}`);
  dotenv.config({ path: envFile });
  return envSchema.parse(process.env);
}
