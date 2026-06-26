import type { Context, Next } from 'hono';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';
import type { AppEnv } from '../types/hono.js';
import type { ErrorResponse } from '../types/api.js';

let anonClient: SupabaseClient | null = null;
function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    const env = getEnv();
    anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  }
  return anonClient;
}

export async function authMiddleware(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const authorization = c.req.header('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return c.json<ErrorResponse>({ error: 'Missing or invalid authorization header' }, 401);
  }
  const token = authorization.replace('Bearer ', '');
  const { data: { user }, error } = await getAnonClient().auth.getUser(token);
  if (error || !user) return c.json<ErrorResponse>({ error: 'Invalid or expired token' }, 401);
  c.set('userId', user.id);
  await next();
}
