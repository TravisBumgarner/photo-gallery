import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().default('sqlite.db'),
  NODE_ENV: z.string().default('development'),
});

export const config = envSchema.parse(process.env);
