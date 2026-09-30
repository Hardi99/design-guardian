export function Spinner({ full = false }: { full?: boolean }) {
  const inner = <div role="status" aria-label="Chargement…" class="w-4 h-4 border-2 border-dg-accent border-t-transparent rounded-full animate-spin" />;
  return full
    ? <div class="flex items-center justify-center h-screen bg-dg-bg">{inner}</div>
    : <div class="flex justify-center py-6">{inner}</div>;
}
