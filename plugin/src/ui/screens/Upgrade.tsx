import { AccountLink } from '../components/AccountLink.js';
import { Header } from '../components/Header.js';

const PLANS = [
  { plan: 'Free', price: '0 €',       features: ['10 checkpoints', 'Diff géométrique', 'Résumés IA'] },
  { plan: 'Pro',  price: '12 €/mois', features: ['Checkpoints illimités', 'Diff géométrique 0,01 px', 'Export Delta JSON'] },
];

export function UpgradeScreen({ onBack }: { onBack: () => void }) {
  return (
    <div class="flex flex-col h-screen bg-dg-bg text-dg-text">
      <Header title="Passer à Pro" onBack={onBack} />
      <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {PLANS.map(({ plan, price, features }) => (
          <div key={plan} class={`p-3 bg-dg-raised border rounded-dg flex flex-col gap-1.5 ${plan === 'Pro' ? 'border-dg-accent' : 'border-dg-border'}`}>
            <div class="flex items-center justify-between">
              <span class="text-[12px] font-semibold">{plan}</span>
              <span class="text-[12px] text-dg-accent-text">{price}</span>
            </div>
            {features.map(f => <p key={f} class="text-[11px] text-dg-text-2">· {f}</p>)}
          </div>
        ))}
        <p class="text-[11px] text-dg-text-2 mt-2">L'abonnement est porté par votre compte : liez-le pour débloquer Pro dans ce plugin.</p>
        <AccountLink />
      </div>
      <p class="text-[10px] text-dg-text-3 text-center p-3">Contact : design-guardian@proton.me</p>
    </div>
  );
}
