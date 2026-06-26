import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM: z.string().default('Design Guardian <noreply@designguardian.app>'),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_FROM_NUMBER: z.string().default(''),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_PRICE_PRO_MONTHLY: z.string().default(''),
  STRIPE_PRICE_PRO_YEARLY: z.string().default(''),
  STRIPE_PRICE_TEAM_MONTHLY: z.string().default(''),
  STRIPE_PRICE_TEAM_YEARLY: z.string().default(''),
  // Sécurité — vides par défaut (comportement non-bloquant) ; à renseigner en prod.
  CORS_ORIGINS: z.string().default(''),   // origines autorisées, séparées par des virgules ; vide = toutes
  METRICS_TOKEN: z.string().default(''),  // si défini, /metrics exige ce bearer token
  WEBAPP_URL: z.string().default(''),     // URL de la webapp (ex: https://designguardian.app) — guard prod ajouté en A5
});

type Env = z.infer<typeof envSchema>;

let env: Env;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(parsed.error.format());
    throw new Error('Invalid environment variables');
  }

  const validated = parsed.data;

  // Garde prod : /metrics ne doit pas être ouvert ; CORS doit être restreint.
  if (validated.NODE_ENV === 'production') {
    if (!validated.METRICS_TOKEN) {
      throw new Error('METRICS_TOKEN is required in production (protège /metrics)');
    }
    if (!validated.CORS_ORIGINS) {
      console.warn('⚠️  CORS_ORIGINS vide en production : CORS ouvert à toutes les origines');
    }
  }

  // N'assigner le cache QU'APRÈS toute validation : si la garde throw et que l'appelant
  // l'attrape, getEnv() ne doit pas resservir un env invalide déjà mis en cache.
  env = validated;
  return env;
}

export function getEnv(): Env {
  if (!env) {
    env = loadEnv();
  }
  return env;
}
