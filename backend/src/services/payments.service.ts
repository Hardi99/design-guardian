import { getStripe, getPriceId, getOrCreateUserCustomer, type PlanId, type Interval } from './stripe.service.js';
import { getSupabaseClient } from '../config/supabase.js';

export type ServiceError = { ok: false; error: string; status: 400 | 404 | 503 };

export interface CheckoutParams {
  userId: string;
  plan: PlanId;
  interval: Interval;
  successUrl: string;
  cancelUrl: string;
}

export type CheckoutOk = { ok: true; url: string | null; sessionId: string };

export async function createUserCheckoutSession(
  p: CheckoutParams,
): Promise<CheckoutOk | ServiceError> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'Stripe not configured', status: 503 };
  if (p.plan === 'free') return { ok: false, error: 'Free plan requires no checkout', status: 400 };

  const priceId = getPriceId(p.plan, p.interval);
  if (!priceId) return { ok: false, error: `Price not configured for ${p.plan}:${p.interval}`, status: 503 };

  const supabase = getSupabaseClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, stripe_customer_id')
    .eq('id', p.userId)
    .single();

  if (!profile) return { ok: false, error: 'Profile not found', status: 404 };

  const customerId = await getOrCreateUserCustomer(
    stripe, p.userId, profile.email ?? null, profile.stripe_customer_id ?? null,
  );

  if (!profile.stripe_customer_id) {
    await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', p.userId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: p.successUrl,
    cancel_url: p.cancelUrl,
    metadata: { user_id: p.userId, plan: p.plan },
    subscription_data: { metadata: { user_id: p.userId, plan: p.plan } },
  });

  return { ok: true, url: session.url, sessionId: session.id };
}

export interface PortalParams { userId: string; returnUrl: string; }
export type PortalOk = { ok: true; url: string };

export async function createUserPortalSession(
  p: PortalParams,
): Promise<PortalOk | ServiceError> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'Stripe not configured', status: 503 };

  const { data: profile } = await getSupabaseClient()
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', p.userId)
    .single();

  if (!profile?.stripe_customer_id) {
    return { ok: false, error: 'No active subscription found', status: 404 };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: p.returnUrl,
  });

  return { ok: true, url: session.url };
}
