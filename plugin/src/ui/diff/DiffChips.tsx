import { IconWarn } from '../components/icons.js';

export function DiffChips({ counts, beforeMode, showDerived, approximate, onToggleBefore, onToggleDerived }: {
  counts: { modified: number; added: number; removed: number; derived: number };
  beforeMode: boolean; showDerived: boolean; approximate: boolean;
  onToggleBefore: () => void; onToggleDerived: () => void;
}) {
  return (
    <div class="absolute top-2 left-2 right-2 flex flex-wrap items-center gap-1.5 text-[10px] z-10">
      <span class="chip bg-dg-info/15 text-dg-info">{counts.modified} modifiés</span>
      {counts.added > 0   && <span class="chip bg-dg-success/15 text-dg-success">{counts.added} ajoutés</span>}
      {counts.removed > 0 && <span class="chip bg-dg-danger/15 text-dg-danger border border-dashed border-dg-danger/60">{counts.removed} supprimés</span>}
      {approximate && <span class="chip bg-dg-warning/15 text-dg-warning" title="Rendu reconstruit : l'aperçu peut différer légèrement du design"><IconWarn /> approximatif</span>}
      {counts.derived > 0 && (
        <button onClick={onToggleDerived} aria-pressed={showDerived}
          class={`chip border border-dotted border-dg-text-3 ${showDerived ? 'bg-dg-hover text-dg-text' : 'bg-dg-raised text-dg-text-2 hover:text-dg-text'}`}>
          {showDerived ? '▾' : '▸'} {counts.derived} dérivés
        </button>
      )}
      <div class="ml-auto flex p-0.5 rounded-full bg-dg-raised border border-dg-border">
        <button onClick={() => { if (!beforeMode) onToggleBefore(); }} aria-pressed={beforeMode}
          class={`px-2.5 py-0.5 rounded-full font-medium ${beforeMode ? 'bg-dg-bg text-dg-text shadow-sm' : 'text-dg-text-2 hover:text-dg-text'}`}>Avant</button>
        <button onClick={() => { if (beforeMode) onToggleBefore(); }} aria-pressed={!beforeMode}
          class={`px-2.5 py-0.5 rounded-full font-medium ${!beforeMode ? 'bg-dg-bg text-dg-text shadow-sm' : 'text-dg-text-2 hover:text-dg-text'}`}>Après</button>
      </div>
    </div>
  );
}
