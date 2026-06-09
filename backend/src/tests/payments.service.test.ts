import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// ─── Mocks pour le service ────────────────────────────────────────────────────
const mockSingle = vi.fn();
const mockUpdateEq = vi.fn(() => Promise.resolve({ data: null, error: null }));
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockSelectEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockSelectEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect, update: mockUpdate }));
vi.mock('../config/supabase.js', () => ({ getSupabaseClient: () => ({ from: mockFrom }) }));

const mockSessionsCreate = vi.fn(async () => ({ id: 'cs_1', url: 'https://stripe/checkout' }));
const mockPortalCreate = vi.fn(async () => ({ url: 'https://portal' }));
const mockCustomersCreate = vi.fn(async () => ({ id: 'cus_1' }));
vi.mock('../services/stripe.service.js', async (orig) => {
  const actual = await orig<typeof import('../services/stripe.service.js')>();
  return {
    ...actual,
    getStripe: () => ({
      customers: { create: mockCustomersCreate },
      checkout: { sessions: { create: mockSessionsCreate } },
      billingPortal: { sessions: { create: mockPortalCreate } },
    }),
    getPriceId: () => 'price_pro_monthly',
  };
});

vi.mock('../services/metrics.service.js', () => ({
  paymentsTotal: { inc: vi.fn() },
}));

import { getOrCreateUserCustomer } from '../services/stripe.service.js';
import { createUserCheckoutSession } from '../services/payments.service.js';
import { createUserPortalSession } from '../services/payments.service.js';

// ─── Tests Task 2 ─────────────────────────────────────────────────────────────

function fakeStripe(createImpl: () => Promise<{ id: string }>) {
  return { customers: { create: vi.fn(createImpl) } } as unknown as Stripe;
}

describe('getOrCreateUserCustomer', () => {
  it('réutilise le customer existant sans appeler Stripe', async () => {
    const stripe = fakeStripe(async () => ({ id: 'cus_new' }));
    const id = await getOrCreateUserCustomer(stripe, 'user-1', 'a@b.co', 'cus_existing');
    expect(id).toBe('cus_existing');
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });

  it('crée un customer avec metadata user_id quand aucun n\'existe', async () => {
    const stripe = fakeStripe(async () => ({ id: 'cus_new' }));
    const id = await getOrCreateUserCustomer(stripe, 'user-1', 'a@b.co', null);
    expect(id).toBe('cus_new');
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'a@b.co',
      metadata: { user_id: 'user-1' },
    });
  });
});

// ─── Tests Task 4 ─────────────────────────────────────────────────────────────

describe('createUserCheckoutSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { id: 'user-1', email: 'a@b.co', stripe_customer_id: null }, error: null });
  });

  it('crée une session avec metadata user_id', async () => {
    const r = await createUserCheckoutSession({
      userId: 'user-1', plan: 'pro', interval: 'monthly',
      successUrl: 'https://app/ok', cancelUrl: 'https://app/no',
    });
    expect(r).toMatchObject({ ok: true, url: 'https://stripe/checkout', sessionId: 'cs_1' });
    expect(mockSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_1', mode: 'subscription',
      metadata: { user_id: 'user-1', plan: 'pro' },
    }));
  });

  it('refuse le plan free', async () => {
    const r = await createUserCheckoutSession({
      userId: 'user-1', plan: 'free' as 'pro', interval: 'monthly',
      successUrl: 'https://app/ok', cancelUrl: 'https://app/no',
    });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('renvoie 404 si le profil est introuvable', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });
    const r = await createUserCheckoutSession({
      userId: 'ghost', plan: 'pro', interval: 'monthly',
      successUrl: 'https://app/ok', cancelUrl: 'https://app/no',
    });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});

// ─── Tests Task 5 ─────────────────────────────────────────────────────────────

describe('createUserPortalSession', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renvoie 404 si pas de stripe_customer_id', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'user-1', stripe_customer_id: null }, error: null });
    const r = await createUserPortalSession({ userId: 'user-1', returnUrl: 'https://app' });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});
