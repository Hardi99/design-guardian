/**
 * Cloudflare Workers entry point
 * Env vars are injected by wrangler (secrets + vars), not dotenv
 */
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createApp } from './app.js';

// Override supabase client initialization to use process.env directly
// (wrangler populates process.env from secrets with nodejs_compat)
const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Missing environment variables:', parsed.error.format());
}

const app = createApp();

export default app;
