import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string(),
  DATABASE_URL: z.string(),
  NODE_ENV: z.string(),
  SESSION_SECRET: z.string(),
  APP_PASSWORD: z.string(),
});

export const config = envSchema.parse(process.env);
