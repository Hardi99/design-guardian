import type { ComponentChildren } from 'preact';
import type { Plan } from '../../store.js';
import { IconBack, IconStar } from './icons.js';

export function Header({ title, subtitle, onBack, right }: {
  title: ComponentChildren; subtitle?: string; onBack?: () => void; right?: ComponentChildren;
}) {
  return (
    <div class="flex items-center gap-1.5 px-2.5 h-12 border-b border-dg-border flex-shrink-0">
      {onBack && <button aria-label="Retour" class="icon-btn" onClick={onBack}><IconBack /></button>}
      <div class={`min-w-0 flex-1 ${onBack ? '' : 'pl-0.5'}`}>
        <p class="text-[13px] font-semibold truncate">{title}</p>
        {subtitle && <p class="text-[11px] text-dg-text-2 truncate">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// Team est abandonné (arbitrage 2026-09-07) : tout plan payant s'affiche « Pro ».
// Pro = simple étiquette (rien à faire au clic, donc pas un bouton) ; Free = invitation à passer Pro.
export function PlanBadge({ plan, onUpgrade }: { plan: Plan; onUpgrade: () => void }) {
  if (plan !== 'free') return (
    <span class="chip bg-dg-gradient text-dg-on-accent" aria-label="Plan Pro — checkpoints illimités."><IconStar /> Pro</span>
  );
  return (
    <button class="chip border border-dg-accent-line text-dg-accent-text hover:bg-dg-accent-soft transition-colors"
      aria-label="Plan Free — 10 checkpoints max. Passer à Pro." onClick={onUpgrade}>Free · Passer Pro</button>
  );
}
