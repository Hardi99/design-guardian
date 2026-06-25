import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// ─── Env mockable ───────────────────────────────────────────────────────────────
const mockEnv = {
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
  STRIPE_PRICE_PRO_YEARLY: 'price_pro_y',
  STRIPE_PRICE_TEAM_MONTHLY: 'price_team_m',
  STRIPE_PRICE_TEAM_YEARLY: 'price_team_y',
};
vi.mock('../config/env.js', () => ({ getEnv: () => mockEnv }));

// ─── Mock Stripe (constructeur) ─────────────────────────────────────────────────
vi.mock('stripe', () => ({
  default: class {
    constructor(public key: string) {}
  },
}));

const {
  getStripe,
  getPriceId,
  getOrCreateUserCustomer,
  PLANS,
} = await import('../services/stripe.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.STRIPE_SECRET_KEY = 'sk_test_123';
});

// ─── getStripe ──────────────────────────────────────────────────────────────────

describe('getStripe', () => {
  it('renvoie null si STRIPE_SECRET_KEY absent', () => {
    mockEnv.STRIPE_SECRET_KEY = '';
    expect(getStripe()).toBeNull();
  });

  it('renvoie un client et le met en cache (même instance)', () => {
    const a = getStripe();
    const b = getStripe();
    expect(a).not.toBeNull();
    expect(a).toBe(b); // singleton ??=
  });
});

// ─── getPriceId ─────────────────────────────────────────────────────────────────

describe('getPriceId', () => {
  it('mappe chaque combinaison plan:interval vers la bonne variable d\'env', () => {
    expect(getPriceId('pro', 'monthly')).toBe('price_pro_m');
    expect(getPriceId('pro', 'yearly')).toBe('price_pro_y');
    expect(getPriceId('team', 'monthly')).toBe('price_team_m');
    expect(getPriceId('team', 'yearly')).toBe('price_team_y');
  });

  it('renvoie null pour une combinaison non mappée (free → undefined → null)', () => {
    expect(getPriceId('free' as 'pro', 'monthly')).toBeNull();
  });
});

// ─── PLANS (prix figés 12/39) ───────────────────────────────────────────────────

describe('PLANS', () => {
  it('Free est gratuit (prix null)', () => {
    const free = PLANS.find(p => p.id === 'free')!;
    expect(free.price_monthly_eur).toBeNull();
    expect(free.price_yearly_eur).toBeNull();
  });

  it('Pro = 12 €/mois (96 €/an) et Team = 39 €/mois (312 €/an) — arbitrage figé', () => {
    const pro = PLANS.find(p => p.id === 'pro')!;
    const team = PLANS.find(p => p.id === 'team')!;
    expect(pro.price_monthly_eur).toBe(12);
    expect(pro.price_yearly_eur).toBe(96);
    expect(team.price_monthly_eur).toBe(39);
    expect(team.price_yearly_eur).toBe(312);
  });
});

// ─── getOrCreateUserCustomer ────────────────────────────────────────────────────

describe('getOrCreateUserCustomer', () => {
  function fakeStripe(createImpl: () => Promise<{ id: string }>) {
    return { customers: { create: vi.fn(createImpl) } } as unknown as Stripe;
  }

  it('réutilise le customer existant sans appeler Stripe', async () => {
    const stripe = fakeStripe(async () => ({ id: 'cus_new' }));
    const id = await getOrCreateUserCustomer(stripe, 'user-1', 'a@b.co', 'cus_existing');
    expect(id).toBe('cus_existing');
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });

  it('crée un customer avec metadata user_id quand aucun n\'existe', async () => {
    const stripe = fakeStripe(async () => ({ id: 'cus_new' }));
    const id = await getOrCreateUserCustomer(stripe, 'user-1', null, null);
    expect(id).toBe('cus_new');
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: undefined,
      metadata: { user_id: 'user-1' },
    });
  });
});
