

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div class={`flex items-center gap-2 flex-shrink-0 ${small ? '' : 'mb-8'}`}>
      <div class={`bg-purple-600 rounded-lg flex items-center justify-center font-bold text-white ${small ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'}`}>DG</div>
      {!small && <span class="font-semibold text-lg">Design Guardian</span>}
    </div>
  );
}

export function Topbar({ label, onBack }: { label: string; onBack?: () => void }) {
  return (
    <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
      {onBack && <button aria-label="Retour" class="text-gray-500 hover:text-white text-sm" onClick={onBack}>←</button>}
      <span class="font-medium text-sm flex-1 truncate">{label}</span>
    </div>
  );
}

export function Spinner({ full = false }: { full?: boolean }) {
  const inner = <div role="status" aria-label="Chargement…" class="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />;
  return full
    ? <div class="flex items-center justify-center h-screen bg-gray-950">{inner}</div>
    : <div class="flex justify-center py-6">{inner}</div>;
}
