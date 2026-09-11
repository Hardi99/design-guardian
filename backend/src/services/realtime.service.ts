import { getEnv } from '../config/env.js';

// Émet un Broadcast Supabase Realtime depuis le serveur via HTTP REST (pas de connexion
// WebSocket serveur). Le plugin abonné au canal `checkpoint:{versionId}` reçoit le résumé
// en push, au lieu de poller. Best-effort : tout échec est avalé (le plugin retombe sur
// le polling en filet), la génération du Patch Note n'en dépend pas.
export async function broadcastSummary(versionId: string, aiSummary: string): Promise<void> {
  const env = getEnv();
  try {
    const res = await fetch(`${env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ topic: `checkpoint:${versionId}`, event: 'summary', payload: { ai_summary: aiSummary } }],
      }),
    });
    if (!res.ok) console.warn(`[realtime] broadcast ${versionId} → HTTP ${res.status}`);
  } catch (e) {
    console.warn(`[realtime] broadcast ${versionId} échec:`, e instanceof Error ? e.message : String(e));
  }
}
