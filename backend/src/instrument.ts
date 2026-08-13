/**
 * Sentry — initialisation. DOIT être importé en tout premier (avant tout autre
 * module) dans le point d'entrée `index.ts` : en ESM, ce module s'évalue avant
 * `@hono/node-server`, ce qui laisse Sentry instrumenter HTTP.
 *
 * Sans SENTRY_DSN (tests / CI / dev sans clé), l'init est un no-op : le SDK
 * n'envoie rien. `dotenv` est chargé ici car `instrument` s'exécute avant
 * `loadEnv()` (qui appelle `dotenv.config()`).
 */
import 'dotenv/config';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // 100 % en dev pour tout voir ; échantillonné en prod (quota free tier).
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Valeurs des variables locales dans les stack frames — debug plus rapide.
    includeLocalVariables: true,
    // Pas de dataCollection → PII conservateur (pas d'IP/headers/cookies) : on
    // capte l'erreur et le contexte requête sans données personnelles.
  });
}
