import { getSupabaseClient } from '../config/supabase.js';
import { getEnv } from '../config/env.js';
import { OpenAIService } from './openai.service.js';
import { aiSummariesGeneratedTotal } from './metrics.service.js';
import { sendCheckpointNotification } from './notification.service.js';
import type { DeltaJSON } from '../types/figma.js';

let openai: OpenAIService | null = null;
const getOpenAI = () => (openai ??= new OpenAIService(getEnv().OPENAI_API_KEY));

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
    summary = await getOpenAI().generatePatchNote(p.delta, p.authorName);
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
