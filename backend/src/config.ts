import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string(),
  DATABASE_URL: z.string(),
  NODE_ENV: z.string(),
  SESSION_SECRET: z.string(),
  APP_PASSWORD: z.string(),
  CORS_ORIGIN: z.string(),
  // Storage backend for media (and the read-only DB pulled at boot). When set
  // to file://DIR, images/thumbnails are served from DIR; unset = legacy local
  // ../public layout. s3:// media serving is not wired yet.
  STORAGE_URL: z.string().optional(),
});

export const config = envSchema.parse(process.env);
