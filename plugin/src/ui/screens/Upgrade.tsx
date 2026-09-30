import { AccountLink } from '../components/AccountLink.js';

export function UpgradeScreen({ onBack }: { onBack: () => void }) {
  return (
<div class="flex flex-col h-screen bg-gray-950 text-white p-6 gap-4">
      <div class="flex items-center gap-3 border-b border-gray-800 pb-4">
        <button aria-label="Retour" class="text-gray-500 hover:text-white text-sm" onClick={() => onBack()}>←</button>
        <span class="font-medium text-sm">Passer à Pro</span>
      </div>
      <div class="flex flex-col gap-3">
        {[
          { plan: 'Free',  price: '0€',   features: ['10 checkpoints / asset', 'Diff géométrique', 'IA Patch Notes'] },
          { plan: 'Pro',   price: '12€/m', features: ['Checkpoints illimités', 'Diff géométrique 0,01px', 'Export Delta JSON'] },
          { plan: 'Team',  price: '39€/m', features: ['Collaboration multi-designers', 'Gold approval flow', 'Priorité support'] },
        ].map(({ plan, price, features }) => (
          <div key={plan} class="p-4 bg-gray-900 border border-gray-800 rounded-lg flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-sm">{plan}</span>
              <span class="text-purple-400 text-sm font-mono">{price}</span>
            </div>
            {features.map(f => <p key={f} class="text-xs text-gray-400">· {f}</p>)}
          </div>
        ))}
      </div>
      <AccountLink />
      <p class="text-xs text-gray-600 text-center mt-auto">Contact : design-guardian@proton.me</p>
    </div>
  );
}
