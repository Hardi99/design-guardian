

export function DiffChips({ counts, beforeMode, showDerived, approximate, onToggleBefore, onToggleDerived }: {
  counts: { modified: number; added: number; removed: number; derived: number };
  beforeMode: boolean; showDerived: boolean; approximate: boolean;
  onToggleBefore: () => void; onToggleDerived: () => void;
}) {
  return (
    <div class="absolute top-2 left-2 right-2 flex flex-wrap items-center gap-1.5 text-[10px] z-10">
      <span class="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">{counts.modified} modifiés</span>
      {counts.added > 0   && <span class="px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">{counts.added} ajoutés</span>}
      {counts.removed > 0 && <span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">{counts.removed} supprimés</span>}
      {approximate && <span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">⚠ approximatif</span>}
      {counts.derived > 0 && (
        <button onClick={onToggleDerived} aria-pressed={showDerived}
          class={`px-1.5 py-0.5 rounded ${showDerived ? 'bg-gray-600 text-gray-100' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>
          {showDerived ? '▾' : '▸'} {counts.derived} dérivés
        </button>
      )}
      <div class="ml-auto flex rounded overflow-hidden border border-gray-700">
        <button onClick={() => { if (!beforeMode) onToggleBefore(); }} aria-pressed={beforeMode}
          class={`px-2 py-0.5 ${beforeMode ? 'bg-gray-600 text-gray-100' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}>Avant</button>
        <button onClick={() => { if (beforeMode) onToggleBefore(); }} aria-pressed={!beforeMode}
          class={`px-2 py-0.5 ${!beforeMode ? 'bg-gray-600 text-gray-100' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}>Après</button>
      </div>
    </div>
  );
}
