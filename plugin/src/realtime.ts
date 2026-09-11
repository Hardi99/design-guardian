// Push du AI Patch Note via Supabase Realtime Broadcast (remplace le polling ; polling
// gardé en filet par l'appelant). Connexion WebSocket brute ÉPHÉMÈRE : ouverte après une
// capture, fermée dès réception du résumé ou au timeout. Le canal `checkpoint:{versionId}`
// vit quelques secondes → pas de heartbeat nécessaire.
//
// Clé anon = PUBLIQUE par design (déjà exposée côté client). Canal public : le versionId
// (uuid non devinable) fait office de secret de capacité ; payload = résumé texte, non sensible.

const SUPABASE_URL = 'https://zrlwwxarwgfkdwgshocb.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpybHd3eGFyd2dma2R3Z3Nob2NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMzE3NzcsImV4cCI6MjA4NDcwNzc3N30.nmLB3ygYYzNQL78QWVoQ0vvp0Xzmjh1Y6PA4DRIBooU';
const WS_URL = `${SUPABASE_URL.replace('https://', 'wss://')}/realtime/v1/websocket?apikey=${ANON}&vsn=1.0.0`;

// PURE (testable) : extrait le résumé d'un message Realtime brut si c'est bien notre
// broadcast `summary`, sinon null (phx_reply, heartbeat, autre event…).
export function extractSummary(raw: string): string | null {
  try {
    const m = JSON.parse(raw) as { event?: string; payload?: { event?: string; payload?: { ai_summary?: unknown } } };
    if (m.event === 'broadcast' && m.payload?.event === 'summary') {
      const s = m.payload.payload?.ai_summary;
      return typeof s === 'string' && s.length > 0 ? s : null;
    }
  } catch { /* message non-JSON / inattendu → ignoré */ }
  return null;
}

// Attend le résumé IA d'une version via Realtime. Résout le résumé, ou `null` (timeout /
// erreur / WS indisponible) → l'appelant retombe alors sur le polling.
export function awaitCheckpointSummary(versionId: string, timeoutMs = 10000): Promise<string | null> {
  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let done = false;
    const finish = (val: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws?.close(); } catch { /* best-effort */ }
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => ws?.send(JSON.stringify({
        topic: `realtime:checkpoint:${versionId}`, event: 'phx_join',
        payload: { config: { broadcast: { self: false } } }, ref: '1',
      }));
      ws.onmessage = (e) => { const s = extractSummary(String(e.data)); if (s) finish(s); };
      ws.onerror = () => finish(null);
      ws.onclose = () => finish(null);
    } catch { finish(null); }
  });
}
