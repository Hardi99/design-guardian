import { useState, useEffect } from 'preact/hooks';
import { useAppStore } from '../../useAppStore.js';
import { send } from '../api.js';
import { Spinner } from '../components/common.js';

export function LoadingScreen() {
  const initErr  = useAppStore(s => s.initErr);
  const setInitErr = useAppStore(s => s.setInitErr);
  // Serveur en veille (hébergement économique) : le 1er appel peut prendre plusieurs secondes.
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 4000); return () => clearTimeout(t); }, []);
  return (
    <div role="status" aria-label={initErr ? 'Erreur de connexion' : 'Connexion au projet…'} class="flex flex-col items-center justify-center h-screen bg-dg-bg text-dg-text gap-3">
      {!initErr && <Spinner />}
      {initErr ? (
        <>
          <p role="alert" class="text-dg-danger text-[11px] text-center px-6">{initErr}</p>
          <button class="btn-secondary" onClick={() => { setInitErr(null); send({ type: 'RETRY_INIT' }); }}>Réessayer</button>
        </>
      ) : (
        <p class="text-dg-text-2 text-[12px] text-center px-6" aria-hidden="true">
          {slow ? 'Le serveur se réveille, encore quelques secondes…' : "Ouverture de l'historique…"}
        </p>
      )}
    </div>
  );
}
