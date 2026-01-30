import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().default('sqlite.db'),
  NODE_ENV: z.string().default('development'),
  SESSION_SECRET: z.string().default('default-secret-change-me'),
  APP_PASSWORD: z.string().default('change-me'),
});

export const config = envSchema.parse(process.env);
