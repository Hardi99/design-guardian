import { Hono } from 'hono';
import type Stripe from 'stripe';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { getSupabaseClient } from '../config/supabase.js';
import { getEnv } from '../config/env.js';
import {
  getStripe,
  getOrCreateCustomer,
  getPriceId,
  PLANS,
  type PlanId,
  type Interval,
} from '../services/stripe.service.js';
import {
  sendSubscriptionStartedEmail,
  sendSubscriptionCancelledEmail,
  sendPaymentFailedEmail,
  sendInvoiceEmail,
} from '../services/notification.service.js';
import { paymentsTotal } from '../services/metrics.service.js';
import type { ErrorResponse } from '../types/api.js';
import type { ProjectEnv } from '../types/hono.js';

const paymentsRouter = new Hono<ProjectEnv>();

// ── GET /api/payments/plans — public, no auth ─────────────────────────────────

paymentsRouter.get('/plans', (c) => c.json({ plans: PLANS }));

// ── POST /api/payments/checkout — create Stripe Checkout session ──────────────

paymentsRouter.post('/checkout', pluginMiddleware, async (c) => {
  const stripe = getStripe();
  if (!stripe) return c.json<ErrorResponse>({ error: 'Stripe not configured' }, 503);

  const { plan, interval, success_url, cancel_url } = await c.req.json<{
    plan: PlanId;
    interval: Interval;
    success_url: string;
    cancel_url: string;
  }>();

  if (plan === 'free') return c.json<ErrorResponse>({ error: 'Free plan requires no checkout' }, 400);

  const priceId = getPriceId(plan, interval);
  if (!priceId) return c.json<ErrorResponse>({ error: `Price not configured for ${plan}:${interval}` }, 503);

  const projectId = c.get('projectId');
  const supabase = getSupabaseClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, stripe_customer_id')
    .eq('id', projectId)
    .single();

  if (!project) return c.json<ErrorResponse>({ error: 'Project not found' }, 404);

  const customerId = await getOrCreateCustomer(
    stripe,
    projectId,
    project.stripe_customer_id ?? null,
    project.name,
  );

  // Persist customer ID if newly created
  if (!project.stripe_customer_id) {
    await supabase.from('projects').update({ stripe_customer_id: customerId }).eq('id', projectId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url,
    cancel_url,
    metadata: { project_id: projectId, plan },
    subscription_data: { metadata: { project_id: projectId, plan } },
  });

  return c.json({ url: session.url, session_id: session.id }, 201);
});

// ── POST /api/payments/portal — Stripe billing portal ────────────────────────

paymentsRouter.post('/portal', pluginMiddleware, async (c) => {
  const stripe = getStripe();
  if (!stripe) return c.json<ErrorResponse>({ error: 'Stripe not configured' }, 503);

  const { return_url } = await c.req.json<{ return_url: string }>();
  const projectId = c.get('projectId');

  const { data: project } = await getSupabaseClient()
    .from('projects')
    .select('stripe_customer_id')
    .eq('id', projectId)
    .single();

  if (!project?.stripe_customer_id) {
    return c.json<ErrorResponse>({ error: 'No active subscription found' }, 404);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: project.stripe_customer_id,
    return_url,
  });

  return c.json({ url: session.url });
});

// ── POST /api/payments/webhook — Stripe signed webhooks (no auth) ─────────────

paymentsRouter.post('/webhook', async (c) => {
  const stripe = getStripe();
  const webhookSecret = getEnv().STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return c.json<ErrorResponse>({ error: 'Stripe webhook not configured' }, 503);
  }

  const body = await c.req.text();
  const sig = c.req.header('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return c.json<ErrorResponse>({ error: 'Webhook signature verification failed' }, 400);
  }

  const supabase = getSupabaseClient();

  switch (event.type) {
    // ── Checkout completed → activate subscription ──────────────────────────
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const projectId = session.metadata?.project_id;
      const plan = (session.metadata?.plan ?? 'pro') as PlanId;
      if (!projectId) break;

      await supabase.from('projects').update({
        plan,
        stripe_subscription_id: session.subscription as string,
      }).eq('id', projectId);

      paymentsTotal.inc({ event: 'subscription_started', plan });

      // Notify the project owner
      const { data: proj } = await supabase
        .from('projects')
        .select('name, notify_email')
        .eq('id', projectId)
        .single();

      if (proj?.notify_email) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string) as unknown as { current_period_end: number };
        const nextDate = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toLocaleDateString('fr-FR')
          : '—';
        sendSubscriptionStartedEmail({
          to: proj.notify_email,
          projectName: proj.name,
          plan,
          nextBillingDate: nextDate,
        }).catch(() => {});
      }
      break;
    }

    // ── Subscription updated (plan change) ──────────────────────────────────
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const projectId = sub.metadata?.project_id;
      if (!projectId) break;

      const plan = (sub.metadata?.plan ?? 'pro') as PlanId;
      await supabase.from('projects').update({ plan }).eq('id', projectId);
      paymentsTotal.inc({ event: 'subscription_updated', plan });
      break;
    }

    // ── Subscription deleted → downgrade to free ─────────────────────────────
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const projectId = sub.metadata?.project_id;
      if (!projectId) break;

      await supabase.from('projects').update({
        plan: 'free',
        stripe_subscription_id: null,
      }).eq('id', projectId);

      paymentsTotal.inc({ event: 'subscription_cancelled', plan: 'free' });

      const { data: proj } = await supabase
        .from('projects')
        .select('name, notify_email')
        .eq('id', projectId)
        .single();

      if (proj?.notify_email) {
        const subAny = sub as unknown as { current_period_end?: number };
        const endDate = subAny.current_period_end
          ? new Date(subAny.current_period_end * 1000).toLocaleDateString('fr-FR')
          : '—';
        sendSubscriptionCancelledEmail({
          to: proj.notify_email,
          projectName: proj.name,
          plan: sub.metadata?.plan ?? 'pro',
          endDate,
        }).catch(() => {});
      }
      break;
    }

    // ── Invoice paid → send invoice email ────────────────────────────────────
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as unknown as Record<string, unknown>;
      const subscriptionId = invoice.subscription as string | null;
      const sub = subscriptionId
        ? await stripe.subscriptions.retrieve(subscriptionId)
        : null;
      const projectId = sub?.metadata?.project_id;
      const hostedUrl = invoice.hosted_invoice_url as string | null;
      if (!projectId || !hostedUrl) break;

      paymentsTotal.inc({ event: 'invoice_paid', plan: sub?.metadata?.plan ?? 'pro' });

      const { data: proj } = await supabase
        .from('projects')
        .select('name, notify_email')
        .eq('id', projectId)
        .single();

      if (proj?.notify_email) {
        const amount = (((invoice.amount_paid as number) ?? 0) / 100).toFixed(2) + ' €';
        const start = new Date(((invoice.period_start as number) ?? 0) * 1000).toLocaleDateString('fr-FR');
        const end   = new Date(((invoice.period_end   as number) ?? 0) * 1000).toLocaleDateString('fr-FR');
        sendInvoiceEmail({
          to: proj.notify_email,
          projectName: proj.name,
          amount,
          invoiceUrl: hostedUrl,
          period: `${start} – ${end}`,
        }).catch(() => {});
      }
      break;
    }

    // ── Invoice payment failed → alert user ──────────────────────────────────
    case 'invoice.payment_failed': {
      const invoice = event.data.object as unknown as Record<string, unknown>;
      const subscriptionId2 = invoice.subscription as string | null;
      const sub = subscriptionId2
        ? await stripe.subscriptions.retrieve(subscriptionId2)
        : null;
      const projectId = sub?.metadata?.project_id;
      if (!projectId) break;

      paymentsTotal.inc({ event: 'payment_failed', plan: sub?.metadata?.plan ?? 'pro' });

      const { data: proj } = await supabase
        .from('projects')
        .select('name, notify_email')
        .eq('id', projectId)
        .single();

      if (proj?.notify_email) {
        const amount = (((invoice.amount_due as number) ?? 0) / 100).toFixed(2) + ' €';
        const nextTs = invoice.next_payment_attempt as number | null;
        const nextAttempt = nextTs
          ? new Date(nextTs * 1000).toLocaleDateString('fr-FR')
          : 'non planifié';
        sendPaymentFailedEmail({
          to: proj.notify_email,
          projectName: proj.name,
          amount,
          nextAttempt,
        }).catch(() => {});
      }
      break;
    }

    default:
      break;
  }

  return c.json({ received: true });
});

export { paymentsRouter };
