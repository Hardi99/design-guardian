import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrCreateUserCustomer } from '../services/stripe.service.js';
import type Stripe from 'stripe';

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
