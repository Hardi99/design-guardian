import type { Version } from '../../store.js';
import { timeAgo } from '../../utils.js';

export function VersionRow({ v, onClick }: { v: Version; onClick?: () => void }) {
  const dot = { approved: 'bg-green-500', review: 'bg-amber-500', draft: 'bg-gray-600' }[v.status];
  const inner = (
    <>
      <div class="relative z-10 flex-shrink-0 mt-1.5">
        <div class={`w-2.5 h-2.5 rounded-full border-2 border-gray-950 ${dot}`} />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono text-gray-400">v{v.version_number}</span>
          {v.status === 'approved' && <span title="Gold : version validée et approuvée — référence de qualité pour l'équipe" class="px-1.5 py-0.5 bg-green-500/10 text-green-400 text-xs rounded cursor-help">✦ Gold</span>}
          {v.status === 'review'   && <span class="px-1.5 py-0.5 bg-amber-500/10  text-amber-400  text-xs rounded">Review</span>}
          <span class="text-xs text-gray-600 ml-auto">{timeAgo(v.created_at)}</span>
        </div>
        {v.author_name && <p class="text-xs text-gray-500 mt-0.5">{v.author_name}</p>}
        {v.ai_summary  && <p class="text-xs text-gray-300 mt-1 leading-relaxed line-clamp-2">{v.ai_summary}</p>}
      </div>
    </>
  );
  if (onClick) return (
    <button
      class="w-full text-left flex items-start gap-3 py-3 hover:bg-gray-900/50 rounded-lg px-1 -mx-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset"
      onClick={onClick}
      aria-label={`Version ${v.version_number}${v.author_name ? ` par ${v.author_name}` : ''}${v.ai_summary ? ` — ${v.ai_summary.slice(0, 80)}` : ''}`}
    >
      {inner}
    </button>
  );
  return <div class="flex items-start gap-3 py-3">{inner}</div>;
}
