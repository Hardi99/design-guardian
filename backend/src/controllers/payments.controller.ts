import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getEnv } from '../config/env.js';
import { getStripe, PLANS } from '../services/stripe.service.js';
import {
  createUserCheckoutSession,
  createUserPortalSession,
  applyStripeEvent,
} from '../services/payments.service.js';
import { checkoutSchema, portalSchema } from '../types/api.js';
import type { ErrorResponse } from '../types/api.js';
import type { UserEnv } from '../types/hono.js';

const paymentsRouter = new Hono<UserEnv>();

// ── GET /api/payments/plans — public ──────────────────────────────────────────
paymentsRouter.get('/plans', (c) => c.json({ plans: PLANS }));

// ── POST /api/payments/checkout — abonnement par compte (JWT web) ─────────────
paymentsRouter.post('/checkout', authMiddleware, zValidator('json', checkoutSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createUserCheckoutSession({
    userId: c.get('userId'),
    plan: body.plan,
    interval: body.interval,
    successUrl: body.success_url,
    cancelUrl: body.cancel_url,
  });
  if (!result.ok) return c.json<ErrorResponse>({ error: result.error }, result.status);
  return c.json({ url: result.url, session_id: result.sessionId }, 201);
});

// ── POST /api/payments/portal — billing portal (JWT web) ──────────────────────
paymentsRouter.post('/portal', authMiddleware, zValidator('json', portalSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createUserPortalSession({
    userId: c.get('userId'),
    returnUrl: body.return_url,
  });
  if (!result.ok) return c.json<ErrorResponse>({ error: result.error }, result.status);
  return c.json({ url: result.url });
});

// ── POST /api/payments/webhook — Stripe signed webhooks (no auth) ─────────────
paymentsRouter.post('/webhook', async (c) => {
  const stripe = getStripe();
  const webhookSecret = getEnv().STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return c.json<ErrorResponse>({ error: 'Stripe webhook not configured' }, 503);
  }

  const rawBody = await c.req.text();
  const sig = c.req.header('stripe-signature') ?? '';

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch {
    return c.json<ErrorResponse>({ error: 'Webhook signature verification failed' }, 400);
  }

  await applyStripeEvent(event);
  return c.json({ received: true });
});

export { paymentsRouter };
