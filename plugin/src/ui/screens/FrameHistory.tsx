import { useAppStore } from '../../useAppStore.js';
import { Header } from '../components/Header.js';
import { VersionRow } from '../components/VersionRow.js';
import { IconLocate } from '../components/icons.js';
import { send } from '../api.js';

// Page-centric : historique d'UNE frame (versions où elle est apparue ou a changé), posé en
// `siblings` par l'accueil — la nav ◀▶ du diff parcourt donc cet historique.
export function FrameHistoryScreen() {
  const frame          = useAppStore(s => s.frame)!;
  const history        = useAppStore(s => s.siblings);
  const setScreen      = useAppStore(s => s.setScreen);
  const setDiffVersion = useAppStore(s => s.setDiffVersion);
  const setFrame       = useAppStore(s => s.setFrame);
  return (
    <div class="flex flex-col h-screen bg-dg-bg text-dg-text">
      <Header title={frame.name} subtitle="Historique de la frame" onBack={() => { setFrame(null); setScreen('home'); }}
        right={<button class="icon-btn" aria-label="Voir sur le canvas" title="Voir sur le canvas"
          onClick={() => send({ type: 'SHOW_ON_CANVAS', key: frame.key })}><IconLocate /></button>} />
      <div class="flex-1 overflow-y-auto">
        {history.length === 0
          ? <p class="text-dg-text-2 text-[12px] p-3">Aucune version pour cette frame.</p>
          : (
            <div class="relative px-3 py-2">
              <div class="absolute left-[15.5px] top-0 bottom-0 w-px bg-dg-border" />
              {[...history].reverse().map(v => (
                <VersionRow key={v.id} v={v} onClick={() => { setDiffVersion(v); setScreen('diff'); }} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
