import { z } from 'zod';

// Load .env for local dev; in CF Workers, process.env is already populated by wrangler secrets
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config();
} catch {
  // dotenv not available or no .env file (expected in CF Workers)
}

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

type Env = z.infer<typeof envSchema>;

let env: Env;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.format());
    throw new Error('Invalid environment variables');
  }

  env = parsed.data;
  return env;
}

export function getEnv(): Env {
  if (!env) {
    env = loadEnv();
  }
  return env;
}
