import type { Version } from '../../store.js';
import { timeAgo } from '../../utils.js';

// Le résumé IA est ce que le produit vend : il ouvre l'accueil.
export function SummaryCard({ version, onOpen }: { version: Version; onOpen: () => void }) {
  return (
    <button onClick={onOpen}
      class="mx-3 mt-3 p-3 text-left rounded-dg bg-dg-raised border border-dg-border hover:border-dg-accent transition-colors flex-shrink-0"
      aria-label={`Dernier checkpoint, version ${version.version_number}`}>
      <p class="text-[10px] text-dg-text-3">
        Dernier checkpoint · v{version.version_number} · {timeAgo(version.created_at)}{version.author_name ? ` · ${version.author_name}` : ''}
      </p>
      <p class="text-[12px] leading-snug mt-1 line-clamp-3">{version.ai_summary ?? 'Pas encore de résumé.'}</p>
    </button>
  );
}
