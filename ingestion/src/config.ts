import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string(),
  SOURCE_DIR: z.string(),
  INGEST_MODE: z.enum(['local', 'production']),
  DRY_RUN: z.string(),
  SSH_HOST: z.string().optional(),
  SSH_DEST_DIR: z.string().optional(),
});

export const config = envSchema.parse(process.env);
