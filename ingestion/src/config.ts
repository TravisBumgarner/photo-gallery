import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().default('sqlite.db'),
  SOURCE_DIR: z.string({ required_error: 'SOURCE_DIR is required' }),
  INGEST_MODE: z.enum(['local', 'production']).default('local'),
  DRY_RUN: z.string().default('false'),
  IMAGE_EXTENSIONS: z.string({ required_error: 'IMAGE_EXTENSIONS is required' }),
  SSH_HOST: z.string().optional(),
  SSH_DEST_DIR: z.string().optional(),
});

export const config = envSchema.parse(process.env);
