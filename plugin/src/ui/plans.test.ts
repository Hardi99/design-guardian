import { describe, it, expect } from 'vitest';
import { PLANS, pricingUrl } from './plans.js';

describe('Offre Free / Pro affichée dans le plugin', () => {
  it('Pro ne revend aucun avantage déjà inclus dans Free', () => {
    const [free, pro] = PLANS;
    expect(pro.features.filter(f => free.features.includes(f))).toEqual([]);
  });

  it('seul vrai avantage Pro côté serveur : les checkpoints illimités', () => {
    expect(PLANS[1].features).toContain('Checkpoints illimités');
  });

  it("« S'abonner » passe par la redirection backend vers la page tarifs", () => {
    expect(pricingUrl('https://api.test')).toBe('https://api.test/api/link/pricing');
  });
});
