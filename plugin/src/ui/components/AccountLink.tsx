import { useEffect, useCallback, useReducer } from 'preact/hooks';
import { useAppStore } from '../../useAppStore.js';
import type { Plan } from '../../store.js';
import { linkReducer } from '../../linkFlow.js';
import { api, send, session } from '../api.js';

export function AccountLink() {
  const apiKey = useAppStore(s => s.apiKey)!;
  const author = useAppStore(s => s.author);
  const setPlan = useAppStore(s => s.setPlan);
  const [state, dispatch] = useReducer(linkReducer, { phase: 'idle' });

  const start = useCallback(async () => {
    dispatch({ type: 'START' });
    try {
      const r = await api<{ code: string; approve_url: string }>(apiKey, '/api/link/start', {
        method: 'POST',
        body: JSON.stringify({ figma_user_id: author?.figma_id ?? '', figma_user_name: author?.name ?? '' }),
      });
      dispatch({ type: 'STARTED', code: r.code });
      send({ type: 'OPEN_EXTERNAL', url: r.approve_url });
    } catch (e) { dispatch({ type: 'FAIL', message: (e as Error).message }); }
  }, [apiKey, author]);

  useEffect(() => {
    if (state.phase !== 'awaiting') return;
    const code = state.code;
    const id = setInterval(async () => {
      try {
        const r = await api<{ status: 'pending' | 'approved' | 'expired'; link_token?: string }>(apiKey, `/api/link/status?code=${code}`);
        if (r.status === 'approved' && r.link_token) {
          session.linkToken = r.link_token;
          send({ type: 'LINK_PERSIST_TOKEN', token: r.link_token });
          dispatch({ type: 'POLL_APPROVED', token: r.link_token });
          const me = await api<{ plan: Plan }>(apiKey, '/api/link/me');
          setPlan(me.plan ?? 'free');
        } else if (r.status === 'expired') {
          dispatch({ type: 'POLL_EXPIRED' });
        }
      } catch { /* transitoire — on retente au tick suivant */ }
    }, 3000);
    return () => clearInterval(id);
  }, [state, apiKey]);

  if (state.phase === 'linked')   return <p class="text-[11px] text-dg-success">✓ Compte lié</p>;
  if (state.phase === 'awaiting') return <p class="text-[11px] text-dg-text-2">En attente d'approbation dans le navigateur…</p>;
  if (state.phase === 'expired')  return <button class="btn-secondary" onClick={() => dispatch({ type: 'RESET' })}>Code expiré — réessayer</button>;
  if (state.phase === 'error')    return <button class="btn-secondary" onClick={start}>Erreur — réessayer</button>;
  return (
    <button class="btn-secondary" onClick={start} disabled={state.phase === 'starting' || !author}>
      {state.phase === 'starting' ? 'Connexion…' : 'Lier mon compte'}
    </button>
  );
}
