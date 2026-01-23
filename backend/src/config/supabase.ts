import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const env = getEnv();
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  }
  return supabaseClient;
}

export function getSupabaseStorage() {
  const client = getSupabaseClient();
  return client.storage;
}
