import type { ComponentChildren } from 'preact';
import type { Plan } from '../../store.js';

export function Header({ title, subtitle, onBack, right }: {
  title: string; subtitle?: string; onBack?: () => void; right?: ComponentChildren;
}) {
  return (
    <div class="flex items-center gap-2 px-3 h-10 border-b border-dg-border flex-shrink-0">
      {onBack && <button aria-label="Retour" class="icon-btn" onClick={onBack}>←</button>}
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-semibold truncate">{title}</p>
        {subtitle && <p class="text-[10px] text-dg-text-3 truncate">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// Team est abandonné (arbitrage 2026-09-07) : tout plan payant s'affiche « Pro ».
export function PlanBadge({ plan, onUpgrade }: { plan: Plan; onUpgrade: () => void }) {
  const pro = plan !== 'free';
  return (
    <button
      class={`px-1.5 py-0.5 rounded-dg text-[10px] font-medium flex-shrink-0 ${pro ? 'bg-dg-accent/15 text-dg-accent-text cursor-default' : 'bg-dg-hover text-dg-text-2'}`}
      aria-label={pro ? 'Plan Pro — checkpoints illimités.' : 'Plan Free — 10 checkpoints max. Cliquer pour passer à Pro.'}
      onClick={() => { if (!pro) onUpgrade(); }}
    >{pro ? 'Pro' : 'Free'}</button>
  );
}
