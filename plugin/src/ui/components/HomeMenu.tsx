import { useState, useEffect, useRef } from 'preact/hooks';
import { useAppStore } from '../../useAppStore.js';
import { appStore } from '../../store.js';
import { send, session } from '../api.js';
import { AccountLink } from './AccountLink.js';
import { IconMore } from './icons.js';

function SplitOffer() {
  const splitOffer = useAppStore(s => s.splitOffer)!;
  return (
    <div role="status" class="p-2 bg-dg-warning/10 border border-dg-warning/30 rounded-dg flex flex-col gap-1.5">
      <p class="text-[11px] text-dg-warning">
        Ce projet est partagé avec d'autres fichiers : {splitOffer.elsewhere.length} élément(s) suivi(s) ne sont pas dans ce fichier.
      </p>
      <p class="text-[11px] text-dg-text-2">
        Séparer ce fichier lui donne son propre historique, avec ses {splitOffer.here.length} élément(s). Les autres restent avec les autres fichiers.
      </p>
      <p class="text-[11px] text-dg-text-2">
        Un élément dont la page a été supprimée est aussi introuvable : s'ils appartiennent bien à ce fichier, ignorez.
      </p>
      <div class="flex gap-2">
        <button class="btn-secondary py-1" onClick={() => send({ type: 'SPLIT_BEGIN' })}>Séparer ce fichier</button>
        <button class="text-[11px] text-dg-text-2 hover:text-dg-text px-2 rounded-full"
          onClick={() => { send({ type: 'SPLIT_DISMISS', assetIds: splitOffer.elsewhere }); appStore.getState().setSplitOffer(null); }}>
          Ignorer
        </button>
      </div>
    </div>
  );
}

export function HomeMenu() {
  // Seuls les historiques de la page courante : en ouvrir un autre bloquerait la capture.
  const assets     = useAppStore(s => s.assets).filter(a => a.page_id === session.pageId);
  const asset      = useAppStore(s => s.asset);
  const setAsset   = useAppStore(s => s.setAsset);
  const splitOffer = useAppStore(s => s.splitOffer);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Fermeture à Échap et au clic en dehors (comportement attendu d'un menu).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [open]);
  return (
    <div class="relative" ref={root}>
      <button aria-label="Menu" aria-expanded={open} class="icon-btn relative" onClick={() => setOpen(o => !o)}>
        <IconMore />{splitOffer && <span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-dg-warning" />}
      </button>
      {open && (
        <div class="absolute right-0 top-full mt-1 z-50 w-64 p-3 bg-dg-raised border border-dg-border rounded-dg shadow-xl flex flex-col gap-3">
          <AccountLink />
          {assets.length > 1 && (
            <label class="flex flex-col gap-1 text-[11px] text-dg-text-2">
              Historique
              <select class="input" value={asset?.id}
                onChange={e => {
                  const next = assets.find(x => x.id === (e.target as HTMLSelectElement).value);
                  if (next) { setAsset(next); setOpen(false); }
                }}>
                {assets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
          )}
          {splitOffer && <SplitOffer />}
        </div>
      )}
    </div>
  );
}
