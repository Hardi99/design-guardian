import type { SupabaseClient } from '@supabase/supabase-js';
import type { NpsRequest } from '../types/api.js';

/**
 * Enregistre une réponse NPS (satisfaction) pour un projet.
 * respondent/comment optionnels ; le score est déjà validé (0–10 entier) par Zod côté controller.
 */
export async function recordNps(
  db: SupabaseClient, projectId: string, input: NpsRequest,
): Promise<{ error: string | null }> {
  const { error } = await db.from('nps_responses').insert({
    project_id: projectId,
    score: input.score,
    comment: input.comment ?? null,
    respondent: input.respondent ?? null,
  });
  return { error: error ? error.message : null };
}
