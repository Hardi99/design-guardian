import { useAppStore } from '../../useAppStore.js';
import { send } from '../api.js';
import { Spinner } from '../components/common.js';

export function LoadingScreen() {
  const initErr  = useAppStore(s => s.initErr);
  const setInitErr = useAppStore(s => s.setInitErr);
  return (
    <div role="status" aria-label={initErr ? 'Erreur de connexion' : 'Connexion au projet…'} class="flex flex-col items-center justify-center h-screen bg-dg-bg text-dg-text gap-3">
      {!initErr && <Spinner />}
      {initErr ? (
        <>
          <p role="alert" class="text-dg-danger text-[11px] text-center px-6">{initErr}</p>
          <button class="btn-secondary" onClick={() => { setInitErr(null); send({ type: 'RETRY_INIT' }); }}>Réessayer</button>
        </>
      ) : (
        <p class="text-dg-text-3 text-[11px]" aria-hidden="true">Ouverture de l'historique…</p>
      )}
    </div>
  );
}
