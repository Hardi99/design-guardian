import { useAppStore } from '../../useAppStore.js';
import { send } from '../api.js';
import { Spinner } from '../components/common.js';

export function LoadingScreen() {
  const initErr  = useAppStore(s => s.initErr);
  const setInitErr = useAppStore(s => s.setInitErr);
  return (
    <div role="status" aria-label={initErr ? 'Erreur de connexion' : 'Connexion au projet…'} class="flex flex-col items-center justify-center h-screen bg-gray-950 text-white gap-3">
      {!initErr && <Spinner />}
      {initErr ? (
        <>
          <p role="alert" class="text-red-400 text-xs text-center px-6">{initErr}</p>
          <button class="btn-secondary text-xs px-3 py-1.5" onClick={() => { setInitErr(null); send({ type: 'RETRY_INIT' }); }}>
            Réessayer
          </button>
        </>
      ) : (
        <p class="text-gray-500 text-xs" aria-hidden="true">Connexion au projet…</p>
      )}
    </div>
  );
}
