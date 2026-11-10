import type { Version } from '../../store.js';
import { timeAgo } from '../../utils.js';
import { summaryCardLabel } from '../../frameNav.js';
import { IconSparkle, IconChevron } from './icons.js';

// Le résumé IA est ce que le produit vend : il ouvre l'accueil, à la couleur de la marque.
export function SummaryCard({ version, onOpen }: { version: Version; onOpen: () => void }) {
  return (
    <button onClick={onOpen}
      class="group mx-3 mt-3 p-3.5 text-left rounded-dg bg-dg-accent-soft border border-dg-accent-line hover:border-dg-accent transition-colors flex-shrink-0"
      aria-label={summaryCardLabel(version)}>
      <p class="flex items-center gap-1.5 text-[11px] font-semibold text-dg-accent-text">
        <IconSparkle /> Résumé IA · v{version.version_number}
        <span class="ml-auto text-dg-text-2 font-normal">{timeAgo(version.created_at)}</span>
      </p>
      <p class="text-[13px] leading-snug mt-1.5 line-clamp-3">{version.ai_summary ?? 'Pas encore de résumé.'}</p>
      <p class="flex items-center gap-1 text-[11px] text-dg-text-2 mt-2">
        {version.author_name ? `par ${version.author_name} · ` : ''}Voir le détail
        <span class="transition-transform group-hover:translate-x-0.5"><IconChevron /></span>
      </p>
    </button>
  );
}
