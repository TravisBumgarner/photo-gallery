import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  SOURCE_DIR: z.string(),
  DESTINATION_DIRECTORY: z.string(),
  INGEST_MODE: z.enum(['local', 'production']),
  DRY_RUN: z.string(),
  SSH_HOST: z.string().optional(),
});

export const config = envSchema.parse(process.env);
