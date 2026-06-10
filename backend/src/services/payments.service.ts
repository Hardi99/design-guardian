import type Stripe from 'stripe';
import { getStripe, getPriceId, getOrCreateUserCustomer, type PlanId, type Interval } from './stripe.service.js';
import { getSupabaseClient } from '../config/supabase.js';
import { paymentsTotal } from './metrics.service.js';

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
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, stripe_customer_id')
    .eq('id', p.userId)
    .single();

  // PGRST116 = "no rows" → 404 ; toute autre erreur = défaillance DB → 503
  if (profileError && profileError.code !== 'PGRST116') {
    return { ok: false, error: 'Database error', status: 503 };
  }
  if (!profile) return { ok: false, error: 'Profile not found', status: 404 };

  const customerId = await getOrCreateUserCustomer(
    stripe, p.userId, profile.email ?? null, profile.stripe_customer_id ?? null,
  );

  if (!profile.stripe_customer_id) {
    const { error: writeErr } = await supabase
      .from('profiles').update({ stripe_customer_id: customerId }).eq('id', p.userId);
    // Ne bloque pas le checkout (la session est valide) mais trace le risque de customer orphelin
    if (writeErr) console.error('[payments] failed to persist stripe_customer_id:', writeErr.message);
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

  const { data: profile, error: profileError } = await getSupabaseClient()
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', p.userId)
    .single();

  if (profileError && profileError.code !== 'PGRST116') {
    return { ok: false, error: 'Database error', status: 503 };
  }
  if (!profile?.stripe_customer_id) {
    return { ok: false, error: 'No active subscription found', status: 404 };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: p.returnUrl,
  });

  return { ok: true, url: session.url };
}

// Met à jour le profil et LÈVE en cas d'erreur DB : le webhook renverra alors 500,
// ce qui pousse Stripe à retenter (évite une dérive silencieuse de l'état d'abonnement).
async function patchProfile(userId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabaseClient().from('profiles').update(patch).eq('id', userId);
  if (error) throw new Error(`Failed to update profile ${userId}: ${error.message}`);
}

export async function applyStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const plan = (session.metadata?.plan ?? 'pro') as PlanId;
      if (!userId) break;
      await patchProfile(userId, { plan, stripe_subscription_id: session.subscription as string });
      paymentsTotal.inc({ event: 'subscription_started', plan });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (!userId) break;
      const plan = (sub.metadata?.plan ?? 'pro') as PlanId;
      await patchProfile(userId, { plan });
      paymentsTotal.inc({ event: 'subscription_updated', plan });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (!userId) break;
      await patchProfile(userId, { plan: 'free', stripe_subscription_id: null });
      paymentsTotal.inc({ event: 'subscription_cancelled', plan: 'free' });
      break;
    }

    default:
      break;
  }
}
