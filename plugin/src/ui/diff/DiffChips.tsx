

export function DiffChips({ counts, beforeMode, showDerived, approximate, onToggleBefore, onToggleDerived }: {
  counts: { modified: number; added: number; removed: number; derived: number };
  beforeMode: boolean; showDerived: boolean; approximate: boolean;
  onToggleBefore: () => void; onToggleDerived: () => void;
}) {
  return (
    <div class="absolute top-2 left-2 right-2 flex flex-wrap items-center gap-1.5 text-[10px] z-10">
      <span class="px-1.5 py-0.5 rounded bg-dg-accent/20 text-dg-accent-text">{counts.modified} modifiés</span>
      {counts.added > 0   && <span class="px-1.5 py-0.5 rounded bg-dg-success/20 text-dg-success">{counts.added} ajoutés</span>}
      {counts.removed > 0 && <span class="px-1.5 py-0.5 rounded bg-dg-danger/20 text-dg-danger">{counts.removed} supprimés</span>}
      {approximate && <span class="px-1.5 py-0.5 rounded bg-dg-warning/20 text-dg-warning">⚠ approximatif</span>}
      {counts.derived > 0 && (
        <button onClick={onToggleDerived} aria-pressed={showDerived}
          class={`px-1.5 py-0.5 rounded ${showDerived ? 'bg-dg-hover text-dg-text' : 'bg-dg-hover text-dg-text-3 hover:text-dg-text-2'}`}>
          {showDerived ? '▾' : '▸'} {counts.derived} dérivés
        </button>
      )}
      <div class="ml-auto flex rounded overflow-hidden border border-dg-border">
        <button onClick={() => { if (!beforeMode) onToggleBefore(); }} aria-pressed={beforeMode}
          class={`px-2 py-0.5 ${beforeMode ? 'bg-dg-hover text-dg-text' : 'bg-dg-raised text-dg-text-3 hover:text-dg-text-2'}`}>Avant</button>
        <button onClick={() => { if (beforeMode) onToggleBefore(); }} aria-pressed={!beforeMode}
          class={`px-2 py-0.5 ${!beforeMode ? 'bg-dg-hover text-dg-text' : 'bg-dg-raised text-dg-text-3 hover:text-dg-text-2'}`}>Après</button>
      </div>
    </div>
  );
}
