import type { SupabaseClient } from '@supabase/supabase-js';

type Result = { data: unknown; error: { message: string; code?: string } | null };

/** Stub minimal pour une chaîne `.from().select().eq()...single()` qui résout `row`. */
export function singleRowDb(row: unknown): Pick<SupabaseClient, 'from'> {
  const result: Result = row
    ? { data: row, error: null }
    : { data: null, error: { message: 'no rows', code: 'PGRST116' } };
  const thenable = {
    select: () => thenable,
    eq: () => thenable,
    not: () => thenable,
    order: () => thenable,
    limit: () => thenable,
    single: async () => result,
    maybeSingle: async () => result,
  };
  return { from: () => thenable } as unknown as Pick<SupabaseClient, 'from'>;
}
