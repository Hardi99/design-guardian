import type { Version } from '../../store.js';
import { timeAgo } from '../../utils.js';
import { IconStar } from './icons.js';

// Une version de la timeline : le résumé IA d'abord, puis numéro, auteur, date, statut.
export function VersionRow({ v, onClick }: { v: Version; onClick?: () => void }) {
  const dot = { approved: 'bg-dg-success', review: 'bg-dg-warning', draft: 'bg-dg-text-3' }[v.status];
  const inner = (
    <>
      <span class={`relative z-10 mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-dg-bg ${dot}`} />
      <div class="flex-1 min-w-0">
        <p class="text-[12px] leading-snug line-clamp-2">{v.ai_summary ?? `Version ${v.version_number}`}</p>
        <p class="text-[11px] text-dg-text-2 mt-0.5 flex items-center gap-1">
          <span class="font-mono">v{v.version_number}</span>
          {v.author_name && <span>· {v.author_name}</span>}
          <span>· {timeAgo(v.created_at)}</span>
          {v.status === 'approved' && <span title="Gold : version validée et approuvée — référence de qualité pour l'équipe" class="chip ml-auto bg-dg-success/15 text-dg-success cursor-help"><IconStar /> Gold</span>}
          {v.status === 'review' && <span class="chip ml-auto bg-dg-warning/15 text-dg-warning">Review</span>}
        </p>
      </div>
    </>
  );
  if (onClick) return (
    <button
      class="w-full text-left flex items-start gap-2.5 py-2 px-1.5 -mx-1.5 rounded-dg hover:bg-dg-hover transition-colors"
      onClick={onClick}
      aria-label={`Version ${v.version_number}${v.author_name ? ` par ${v.author_name}` : ''}${v.ai_summary ? ` — ${v.ai_summary.slice(0, 80)}` : ''}`}
    >
      {inner}
    </button>
  );
  return <div class="flex items-start gap-2.5 py-2">{inner}</div>;
}
