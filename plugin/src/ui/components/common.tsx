// `inline` : dans une ligne de texte (pas de bloc ni de marge) ; `full` : écran entier.
export function Spinner({ full = false, inline = false }: { full?: boolean; inline?: boolean }) {
  const size = inline ? 'w-3 h-3' : 'w-5 h-5';
  const inner = <span role="status" aria-label="Chargement…" class={`inline-block ${size} border-2 border-dg-accent border-t-transparent rounded-full animate-spin`} />;
  if (inline) return inner;
  return full
    ? <div class="flex items-center justify-center h-screen bg-dg-bg">{inner}</div>
    : <div class="flex justify-center py-6">{inner}</div>;
}
