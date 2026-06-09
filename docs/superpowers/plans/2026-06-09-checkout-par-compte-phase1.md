# Checkout par compte (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le paiement Stripe réel et **au niveau du compte** depuis la webapp Next.js, sans toucher au plugin Figma.

**Architecture:** Séparation Service/Controller (règle projet). Toute l'orchestration Stripe + Supabase vit dans `payments.service.ts` (testable unitairement) ; les routes Hono deviennent de fines enveloppes. L'abonnement est porté par `profiles` (un customer Stripe par utilisateur). La webapp s'authentifie enfin auprès du backend via `Authorization: Bearer`.

**Tech Stack:** Hono (backend, `Hono<UserEnv>`), Stripe SDK, Supabase (service-role côté backend, `@supabase/ssr` côté webapp), Vitest (tests backend uniquement — la webapp n'a pas de runner de test, on vérifie par typecheck/build/exécution).

**Référence spec :** `docs/superpowers/specs/2026-06-09-unification-identite-checkout-design.md` (§0–§7, Phase 1).

**Conventions de vérification :**
- Tests backend : `cd backend && npx vitest run <chemin>`
- Typecheck backend : `cd backend && npx tsc --noEmit`
- Typecheck webapp : `cd frontend && npx tsc --noEmit`

---

## Décisions verrouillées (rappel)

- Abonnement **par compte** → `profiles.plan` est la source de vérité.
- Checkout authentifié par **JWT Supabase web** (`authMiddleware`), pas d'`X-API-Key`.
- Intervalle **mensuel uniquement** pour la Phase 1 (`interval: 'monthly'`).
- `projects.plan` / colonnes Stripe sur `projects` : laissés en place, **ignorés** (pas de migration destructive).
- Le plugin n'est **pas** modifié.

---

## File Structure

| Fichier | Création/Modif | Responsabilité |
|---|---|---|
| `supabase/migrations/009_account_billing.sql` | Create | Colonnes billing sur `profiles` |
| `backend/src/services/stripe.service.ts` | Modify | Ajout `getOrCreateUserCustomer` |
| `backend/src/services/payments.service.ts` | Create | Orchestration checkout / portal / webhook (testable) |
| `backend/src/types/api.ts` | Modify | Schémas Zod `checkoutSchema`, `portalSchema` |
| `backend/src/controllers/payments.controller.ts` | Modify | Routes fines : checkout/portal (JWT), webhook (→ service) |
| `backend/src/tests/payments.service.test.ts` | Create | Tests unitaires du service |
| `frontend/lib/api/client.ts` | Modify | Header Bearer + méthode `createCheckout` |
| `frontend/app/pricing/page.tsx` | Modify | CTA « Passer à Pro » → checkout |
| `frontend/app/(dashboard)/dashboard/page.tsx` | Modify | Bannière `?checkout=success` |

---

## Task 1: Migration — billing sur `profiles`

**Files:**
- Create: `supabase/migrations/009_account_billing.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- Migration 009 — Abonnement porté par le compte (profiles), pas par projet.
-- Défensive (IF NOT EXISTS) : la prod a divergé des migrations trackées.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free','pro','team')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id);
```

- [ ] **Step 2: Appliquer la migration sur Supabase**

Appliquer via le dashboard Supabase (SQL Editor) ou la CLI. Vérification : la table `profiles` possède les colonnes `plan`, `stripe_customer_id`, `stripe_subscription_id`.

Run (si CLI configurée) : `npx supabase db push`
Sinon : coller le SQL dans le SQL Editor du projet Supabase.
Expected : exécution sans erreur ; colonnes présentes.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_account_billing.sql
git commit -m "feat(db): account-level billing columns on profiles (migration 009)"
```

---

## Task 2: `getOrCreateUserCustomer` (helper Stripe par utilisateur)

**Files:**
- Modify: `backend/src/services/stripe.service.ts` (ajout en fin de fichier)
- Test: `backend/src/tests/payments.service.test.ts` (créé ici, complété aux tâches suivantes)

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/tests/payments.service.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
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
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd backend && npx vitest run src/tests/payments.service.test.ts`
Expected: FAIL — `getOrCreateUserCustomer` n'est pas exporté.

- [ ] **Step 3: Implémenter le helper**

Ajouter à la fin de `backend/src/services/stripe.service.ts` :

```ts
// ── Customer par utilisateur (abonnement par compte) ──────────────────────────

export async function getOrCreateUserCustomer(
  stripe: Stripe,
  userId: string,
  email: string | null,
  existingCustomerId: string | null,
): Promise<string> {
  if (existingCustomerId) return existingCustomerId;
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { user_id: userId },
  });
  return customer.id;
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `cd backend && npx vitest run src/tests/payments.service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/stripe.service.ts backend/src/tests/payments.service.test.ts
git commit -m "feat(payments): add per-user Stripe customer helper"
```

---

## Task 3: Schémas Zod checkout/portal

**Files:**
- Modify: `backend/src/types/api.ts` (ajout après `autoInitSchema`)

- [ ] **Step 1: Ajouter les schémas**

Ajouter dans `backend/src/types/api.ts` (après les schémas projet existants) :

```ts
// ── Paiements (abonnement par compte) ─────────────────────────────────────────
export const checkoutSchema = z.object({
  plan: z.enum(['pro', 'team']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});
export type CheckoutRequest = z.infer<typeof checkoutSchema>;

export const portalSchema = z.object({
  return_url: z.string().url(),
});
export type PortalRequest = z.infer<typeof portalSchema>;
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/api.ts
git commit -m "feat(payments): zod schemas for account checkout/portal"
```

---

## Task 4: Service `createUserCheckoutSession`

**Files:**
- Create: `backend/src/services/payments.service.ts`
- Test: `backend/src/tests/payments.service.test.ts` (ajout)

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `backend/src/tests/payments.service.test.ts` (en haut, après les imports existants, ajouter les mocks ; puis le bloc describe) :

```ts
// ─── Mocks pour le service ────────────────────────────────────────────────────
const mockSingle = vi.fn();
const mockUpdateEq = vi.fn(() => Promise.resolve({ data: null, error: null }));
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockSelectEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockSelectEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect, update: mockUpdate }));
vi.mock('../config/supabase.js', () => ({ getSupabaseClient: () => ({ from: mockFrom }) }));

const mockSessionsCreate = vi.fn(async () => ({ id: 'cs_1', url: 'https://stripe/checkout' }));
vi.mock('../services/stripe.service.js', async (orig) => {
  const actual = await orig<typeof import('../services/stripe.service.js')>();
  return {
    ...actual,
    getStripe: () => ({ checkout: { sessions: { create: mockSessionsCreate } } }),
    getPriceId: () => 'price_pro_monthly',
    getOrCreateUserCustomer: async () => 'cus_1',
  };
});

import { createUserCheckoutSession } from '../services/payments.service.js';

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
```

> Note : ajouter `beforeEach` à l'import vitest en tête de fichier → `import { describe, it, expect, vi, beforeEach } from 'vitest';`

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd backend && npx vitest run src/tests/payments.service.test.ts`
Expected: FAIL — `payments.service.js` / `createUserCheckoutSession` introuvable.

- [ ] **Step 3: Implémenter le service**

Créer `backend/src/services/payments.service.ts` :

```ts
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
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `cd backend && npx vitest run src/tests/payments.service.test.ts`
Expected: PASS (5 tests au total).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/payments.service.ts backend/src/tests/payments.service.test.ts
git commit -m "feat(payments): account-level checkout session service"
```

---

## Task 5: Service `createUserPortalSession`

**Files:**
- Modify: `backend/src/services/payments.service.ts`
- Test: `backend/src/tests/payments.service.test.ts` (ajout)

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `backend/src/tests/payments.service.test.ts` :

```ts
import { createUserPortalSession } from '../services/payments.service.js';

describe('createUserPortalSession', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renvoie 404 si pas de stripe_customer_id', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'user-1', stripe_customer_id: null }, error: null });
    const r = await createUserPortalSession({ userId: 'user-1', returnUrl: 'https://app' });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});
```

> Le mock `stripe.service.js` doit exposer `billingPortal`. Compléter l'objet retourné par `getStripe` dans le `vi.mock` existant (Task 4) en ajoutant `billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://portal' })) } }` à côté de `checkout`.

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd backend && npx vitest run src/tests/payments.service.test.ts`
Expected: FAIL — `createUserPortalSession` introuvable.

- [ ] **Step 3: Implémenter**

Ajouter à `backend/src/services/payments.service.ts` :

```ts
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
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `cd backend && npx vitest run src/tests/payments.service.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/payments.service.ts backend/src/tests/payments.service.test.ts
git commit -m "feat(payments): account-level billing portal service"
```

---

## Task 6: Service `applyStripeEvent` (logique webhook par compte)

**Files:**
- Modify: `backend/src/services/payments.service.ts`
- Test: `backend/src/tests/payments.service.test.ts` (ajout)

> Portée Phase 1 : on met à jour `profiles.plan` + la métrique `paymentsTotal` pour les 3 événements d'abonnement. Les emails (started/cancelled/invoice) sont **différés** (Phase 2/produit) : ils nécessitent des lookups `profiles.email` et ne sont pas requis par le cours. Le code email existant de l'ancien webhook (clé `project_id`) est retiré — il ne se déclenchait que pour des metadata projet que le nouveau flux ne produit plus.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `backend/src/tests/payments.service.test.ts` :

```ts
// Mock métriques pour éviter la double-registration prom-client
vi.mock('../services/metrics.service.js', () => ({
  paymentsTotal: { inc: vi.fn() },
}));

import { applyStripeEvent } from '../services/payments.service.js';
import type Stripe from 'stripe';

describe('applyStripeEvent', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('checkout.session.completed → profiles.plan = pro par user_id', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { subscription: 'sub_1', metadata: { user_id: 'user-1', plan: 'pro' } } },
    } as unknown as Stripe.Event;

    await applyStripeEvent(event);

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'pro', stripe_subscription_id: 'sub_1' }),
    );
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('customer.subscription.deleted → profiles.plan = free', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { user_id: 'user-1', plan: 'pro' } } },
    } as unknown as Stripe.Event;

    await applyStripeEvent(event);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'free', stripe_subscription_id: null }),
    );
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('ignore un event sans user_id', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { metadata: {} } },
    } as unknown as Stripe.Event;
    await applyStripeEvent(event);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd backend && npx vitest run src/tests/payments.service.test.ts`
Expected: FAIL — `applyStripeEvent` introuvable.

- [ ] **Step 3: Implémenter**

`PlanId` est déjà importé en tête de fichier (Task 4). Ajouter **uniquement** ces deux imports en tête de `backend/src/services/payments.service.ts` :

```ts
import type Stripe from 'stripe';
import { paymentsTotal } from './metrics.service.js';
```

Puis ajouter la fonction :

```ts
export async function applyStripeEvent(event: Stripe.Event): Promise<void> {
  const supabase = getSupabaseClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const plan = (session.metadata?.plan ?? 'pro') as PlanId;
      if (!userId) break;
      await supabase.from('profiles').update({
        plan,
        stripe_subscription_id: session.subscription as string,
      }).eq('id', userId);
      paymentsTotal.inc({ event: 'subscription_started', plan });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (!userId) break;
      const plan = (sub.metadata?.plan ?? 'pro') as PlanId;
      await supabase.from('profiles').update({ plan }).eq('id', userId);
      paymentsTotal.inc({ event: 'subscription_updated', plan });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (!userId) break;
      await supabase.from('profiles').update({
        plan: 'free',
        stripe_subscription_id: null,
      }).eq('id', userId);
      paymentsTotal.inc({ event: 'subscription_cancelled', plan: 'free' });
      break;
    }

    default:
      break;
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `cd backend && npx vitest run src/tests/payments.service.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/payments.service.ts backend/src/tests/payments.service.test.ts
git commit -m "feat(payments): account-level stripe webhook event handler"
```

---

## Task 7: Réécrire les routes du controller (fines, JWT)

**Files:**
- Modify: `backend/src/controllers/payments.controller.ts` (réécriture quasi complète)

- [ ] **Step 1: Réécrire le controller**

Remplacer l'intégralité de `backend/src/controllers/payments.controller.ts` par :

```ts
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
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: aucune erreur. (Le router est désormais `Hono<UserEnv>`, compatible avec `app.route('/api/payments', paymentsRouter)`.)

- [ ] **Step 3: Lancer toute la suite backend**

Run: `cd backend && npx vitest run`
Expected: tous les tests passent (suite existante + payments.service).

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/payments.controller.ts
git commit -m "refactor(payments): thin JWT routes delegating to payments.service"
```

---

## Task 8: webapp — `apiClient` envoie le Bearer + méthode `createCheckout`

**Files:**
- Modify: `frontend/lib/api/client.ts`

- [ ] **Step 1: Ajouter l'auth Bearer et la méthode checkout**

Dans `frontend/lib/api/client.ts`, ajouter en haut du fichier l'import du client Supabase :

```ts
import { createClient } from '@/lib/supabase/client';
```

Ajouter une méthode privée d'en-têtes authentifiés dans la classe `APIClient` (après le constructeur) :

```ts
  private async authHeaders(): Promise<Record<string, string>> {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
```

Modifier `getProjects` pour envoyer le token et ne plus passer `owner_id` en query :

```ts
  async getProjects(_ownerId?: string): Promise<Project[]> {
    const res = await fetch(`${this.baseURL}/api/projects`, {
      headers: await this.authHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch projects');
    const data = await res.json();
    return data.projects;
  }
```

Modifier `createProject` pour envoyer le token (le backend lit `owner_id` depuis le JWT) :

```ts
  async createProject(name: string, _ownerId?: string): Promise<Project> {
    const res = await fetch(`${this.baseURL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.authHeaders()) },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    const data = await res.json();
    return data.project;
  }
```

Ajouter la méthode checkout (avant la fermeture de la classe) :

```ts
  async createCheckout(plan: 'pro' | 'team', interval: 'monthly' | 'yearly' = 'monthly'): Promise<string> {
    const origin = window.location.origin;
    const res = await fetch(`${this.baseURL}/api/payments/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.authHeaders()) },
      body: JSON.stringify({
        plan,
        interval,
        success_url: `${origin}/dashboard?checkout=success`,
        cancel_url: `${origin}/pricing`,
      }),
    });
    if (!res.ok) throw new Error('Failed to start checkout');
    const data = await res.json();
    return data.url as string;
  }
```

> Les paramètres `_ownerId` sont conservés (préfixe `_`) pour ne pas casser les appelants existants (`dashboard/page.tsx` passe `user.id`). Ils sont ignorés.

- [ ] **Step 2: Vérifier le typecheck webapp**

Run: `cd frontend && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api/client.ts
git commit -m "feat(web): attach Supabase bearer token + createCheckout method"
```

---

## Task 9: webapp — CTA pricing « Passer à Pro » fonctionnel

**Files:**
- Modify: `frontend/app/pricing/page.tsx`

> La page est actuellement un Server Component (pas de `'use client'`). On extrait le bouton dans un petit Client Component pour gérer le clic + l'état de session, sans transformer toute la page.

- [ ] **Step 1: Créer le composant bouton client**

Créer `frontend/app/pricing/CheckoutButton.tsx` :

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { apiClient } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';

interface Props {
  plan: 'pro' | 'team';
  label: string;
  href?: string;            // pour les CTA non-checkout (Free → /login, Team → mailto)
  className: string;
}

export function CheckoutButton({ plan, label, href, className }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (href) {
    return <Link href={href} className={className}>{label}</Link>;
  }

  const handleClick = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push('/login?next=/pricing');
        return;
      }
      const url = await apiClient.createCheckout(plan);
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : label}
    </button>
  );
}
```

- [ ] **Step 2: Brancher le bouton dans la page pricing**

Dans `frontend/app/pricing/page.tsx` :

1. Ajouter en haut : `import { CheckoutButton } from './CheckoutButton';`
2. Étendre chaque entrée du tableau `plans` avec un champ `planId` :
   - Free → `planId: null` (garde `ctaHref: "/login"`)
   - Pro → `planId: 'pro' as const`
   - Team → `planId: null` (garde `ctaHref: "mailto:contact@design-guardian.io"`)
3. Remplacer le `<Link ...>{plan.cta}</Link>` final (lignes ~139-148) par :

```tsx
                <CheckoutButton
                  plan={(plan.planId ?? 'pro')}
                  label={plan.cta}
                  href={plan.planId ? undefined : plan.ctaHref}
                  className={`block w-full text-center py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-85 ${
                    plan.featured ? "bg-primary text-white" : "bg-muted text-foreground"
                  }`}
                />
```

- [ ] **Step 3: Vérifier le typecheck webapp**

Run: `cd frontend && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/pricing/page.tsx frontend/app/pricing/CheckoutButton.tsx
git commit -m "feat(web): wire pricing CTA to Stripe checkout"
```

---

## Task 10: webapp — bannière de confirmation post-paiement

**Files:**
- Modify: `frontend/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Afficher une bannière quand `?checkout=success`**

Dans `frontend/app/(dashboard)/dashboard/page.tsx` (Client Component), ajouter après les `useState` existants :

```tsx
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      setCheckoutSuccess(true);
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);
```

Ajouter le rendu de la bannière juste après l'ouverture du `<div className="mx-auto max-w-7xl ...">` du `return` principal (avant le bloc Header) :

```tsx
      {checkoutSuccess && (
        <Alert className="mb-6 border-green-500/40">
          <AlertDescription>
            🎉 Abonnement activé. Votre compte est maintenant Pro.
          </AlertDescription>
        </Alert>
      )}
```

> `Alert` / `AlertDescription` sont déjà importés dans ce fichier. `useEffect` est déjà importé.

- [ ] **Step 2: Vérifier le typecheck webapp**

Run: `cd frontend && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat(web): post-checkout success banner on dashboard"
```

---

## Task 11: Vérification end-to-end (manuelle)

**Files:** aucun (validation)

- [ ] **Step 1: Variables d'environnement**

Vérifier côté backend : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY` sont définis (mode test Stripe). Côté webapp : `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

- [ ] **Step 2: Lancer backend + webhook Stripe local**

```bash
cd backend && npm run dev
```
Dans un autre terminal : `stripe listen --forward-to localhost:3001/api/payments/webhook`
(reporter le `whsec_...` affiché dans `STRIPE_WEBHOOK_SECRET` si différent).

- [ ] **Step 3: Parcours complet**

```bash
cd frontend && npm run dev
```
1. Se connecter (magic-link).
2. `/pricing` → « Passer à Pro » → redirection Stripe Checkout.
3. Payer avec la carte test `4242 4242 4242 4242`.
4. Retour `/dashboard?checkout=success` → bannière verte.
5. Vérifier dans Supabase : `profiles.plan = 'pro'` et `stripe_subscription_id` renseigné pour l'utilisateur.

Expected : la ligne `profiles` de l'utilisateur passe à `pro`.

- [ ] **Step 4: Commit (le cas échéant — notes de vérif)**

Aucun changement de code attendu ici. Si un ajustement est nécessaire, commit dédié.

---

## Definition of Done (Phase 1)

- [ ] `cd backend && npx vitest run` : vert (suite existante + nouveaux tests payments.service).
- [ ] `cd backend && npx tsc --noEmit` : zéro erreur.
- [ ] `cd frontend && npx tsc --noEmit` : zéro erreur.
- [ ] Parcours manuel : login → checkout Pro → `profiles.plan = pro` → bannière succès.
- [ ] Le plugin n'a **pas** été modifié (aucun fichier sous `plugin/`).
