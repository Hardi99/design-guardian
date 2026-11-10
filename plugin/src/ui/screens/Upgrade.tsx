import { AccountLink } from '../components/AccountLink.js';
import { Header } from '../components/Header.js';
import { IconCheck, IconStar } from '../components/icons.js';
import { API_BASE, send } from '../api.js';
import { PLANS, pricingUrl } from '../plans.js';

export function UpgradeScreen({ onBack }: { onBack: () => void }) {
  return (
    <div class="flex flex-col h-screen bg-dg-bg text-dg-text">
      <Header title="Passer à Pro" onBack={onBack} />
      <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {PLANS.map(({ plan, price, features }) => {
          const pro = plan === 'Pro';
          return (
            <div key={plan} class={`p-3.5 rounded-dg border flex flex-col gap-2 ${pro ? 'bg-dg-accent-soft border-dg-accent' : 'bg-dg-raised border-dg-border'}`}>
              <div class="flex items-center justify-between">
                <span class="flex items-center gap-1.5 text-[13px] font-semibold">
                  {pro && <span class="text-dg-accent-text"><IconStar /></span>}{plan}
                </span>
                <span class={`text-[13px] font-semibold ${pro ? 'text-dg-accent-text' : 'text-dg-text-2'}`}>{price}</span>
              </div>
              {features.map(f => (
                <p key={f} class="flex items-center gap-1.5 text-[12px] text-dg-text-2">
                  <span class={pro ? 'text-dg-accent-text' : 'text-dg-success'}><IconCheck /></span>{f}
                </p>
              ))}
            </div>
          );
        })}

        <button class="btn-primary w-full mt-1" onClick={() => send({ type: 'OPEN_EXTERNAL', url: pricingUrl(API_BASE) })}>
          S'abonner à Pro
        </button>
        <p class="text-[11px] text-dg-text-2 text-center leading-snug">
          Le paiement se fait sur le site. Ensuite, lie ton compte ici pour débloquer Pro dans le plugin.
        </p>
        <div class="flex justify-center"><AccountLink /></div>
      </div>
      <p class="text-[11px] text-dg-text-2 text-center p-3">Contact : design-guardian@proton.me</p>
    </div>
  );
}
