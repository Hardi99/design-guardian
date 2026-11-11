import { getSupabaseClient } from '../config/supabase.js';
import { getEnv } from '../config/env.js';
import { OpenAIService } from './openai.service.js';
import { aiSummariesGeneratedTotal } from './metrics.service.js';
import { sendCheckpointNotification } from './notification.service.js';
import { broadcastSummary } from './realtime.service.js';
import type { DeltaJSON } from '../types/figma.js';
import { withScopeNote } from './scope.service.js';

let openai: OpenAIService | null = null;
const getOpenAI = () => (openai ??= new OpenAIService(getEnv().OPENAI_API_KEY));

/** Résumé IA d'un diff, sans l'écrire en base (comparaison de deux versions). null si l'IA échoue. */
export async function summarizeDelta(delta: DeltaJSON, authorName: string): Promise<string | null> {
  try { return await getOpenAI().generatePatchNote(delta, authorName); } catch { return null; }
}

export interface GenerateSummaryParams {
  versionId: string;
  delta: DeltaJSON;
  authorName: string;
  branchName: string;
  versionNumber: number;
  projectName: string;
  notifyEmail?: string | null;
}

/**
 * Génère le AI Patch Note d'une version et l'écrit en base.
 * Best-effort : ne throw jamais (appelé en fire-and-forget). Renvoie true si l'écriture a réussi.
 */
export async function generateAndStoreSummary(p: GenerateSummaryParams): Promise<boolean> {
  let summary: string;
  try {
    summary = withScopeNote(await getOpenAI().generatePatchNote(p.delta, p.authorName), p.delta.scopeIn);
  } catch {
    aiSummariesGeneratedTotal.inc({ status: 'error' });
    return false;
  }

  const { error } = await getSupabaseClient()
    .from('versions')
    .update({ ai_summary: summary })
    .eq('id', p.versionId);

  if (error) {
    aiSummariesGeneratedTotal.inc({ status: 'error' });
    return false;
  }

  aiSummariesGeneratedTotal.inc({ status: 'success' });

  // Push Realtime : le plugin abonné au canal reçoit le résumé sans poller (best-effort).
  await broadcastSummary(p.versionId, summary);

  if (p.notifyEmail) {
    sendCheckpointNotification({
      to: p.notifyEmail,
      authorName: p.authorName,
      projectName: p.projectName,
      branchName: p.branchName,
      versionNumber: p.versionNumber,
      aiSummary: summary,
    }).catch(() => { /* best-effort */ });
  }

  return true;
}
