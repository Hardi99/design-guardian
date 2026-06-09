import Stripe from 'stripe';
import { getEnv } from '../config/env.js';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = getEnv().STRIPE_SECRET_KEY;
  if (!key) return null;
  return (stripeClient ??= new Stripe(key));
}

// ── Plan catalogue ────────────────────────────────────────────────────────────

export type PlanId = 'free' | 'pro' | 'team';
export type Interval = 'monthly' | 'yearly';

export interface Plan {
  id: PlanId;
  name: string;
  price_monthly_eur: number | null;
  price_yearly_eur: number | null;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price_monthly_eur: null,
    price_yearly_eur: null,
    features: [
      '1 projet',
      '5 checkpoints / jour',
      'AI Patch Notes',
      'Historique 30 jours',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price_monthly_eur: 12,
    price_yearly_eur: 96,
    features: [
      'Projets illimités',
      'Checkpoints illimités',
      'AI Patch Notes',
      'Historique illimité',
      'Gold status',
      'Export JSON',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price_monthly_eur: 39,
    price_yearly_eur: 312,
    features: [
      'Tout Pro inclus',
      'Collaboration temps réel',
      'Branches illimitées',
      'Merge de branches',
      'Notifications email',
      'Support prioritaire',
    ],
  },
];

// ── Price ID helpers ──────────────────────────────────────────────────────────

export function getPriceId(plan: PlanId, interval: Interval): string | null {
  const env = getEnv();
  const map: Record<string, string | undefined> = {
    'pro:monthly':  env.STRIPE_PRICE_PRO_MONTHLY,
    'pro:yearly':   env.STRIPE_PRICE_PRO_YEARLY,
    'team:monthly': env.STRIPE_PRICE_TEAM_MONTHLY,
    'team:yearly':  env.STRIPE_PRICE_TEAM_YEARLY,
  };
  return map[`${plan}:${interval}`] ?? null;
}

// ── Customer helpers ──────────────────────────────────────────────────────────

export async function getOrCreateCustomer(
  stripe: Stripe,
  projectId: string,
  existingCustomerId: string | null,
  projectName: string,
): Promise<string> {
  if (existingCustomerId) return existingCustomerId;
  const customer = await stripe.customers.create({
    name: projectName,
    metadata: { project_id: projectId },
  });
  return customer.id;
}

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
