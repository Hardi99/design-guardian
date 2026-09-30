import { useAppStore } from '../../useAppStore.js';
import { Topbar } from '../components/common.js';
import { VersionRow } from '../components/VersionRow.js';

// Page-centric : historique d'UNE frame (versions où elle est apparue ou a changé), posé en
// `siblings` par l'accueil — la nav ◀▶ du diff parcourt donc cet historique.
export function FrameHistoryScreen() {
  const frame          = useAppStore(s => s.frame)!;
  const history        = useAppStore(s => s.siblings);
  const setScreen      = useAppStore(s => s.setScreen);
  const setDiffVersion = useAppStore(s => s.setDiffVersion);
  const setFrame       = useAppStore(s => s.setFrame);
  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white">
      <Topbar label={frame.name} onBack={() => { setFrame(null); setScreen('home'); }} />
      <div class="flex-1 overflow-y-auto">
        {history.length === 0
          ? <p class="text-gray-500 text-xs p-4">Aucune version pour cette frame.</p>
          : (
            <div class="relative px-4 py-3">
              <div class="absolute left-7 top-0 bottom-0 w-px bg-gray-800" />
              {[...history].reverse().map(v => (
                <VersionRow key={v.id} v={v} onClick={() => { setDiffVersion(v); setScreen('diff'); }} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
