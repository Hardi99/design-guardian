// ─── Sentry — UI THREAD (webview) uniquement ────────────────────────────────
// main.ts s'exécute dans le sandbox Figma (pas de window/fetch/DOM) : il ne peut
// pas héberger @sentry/browser. On instrumente donc la surface d'erreurs
// principale (le webview). Erreurs main-thread = limitation connue.
import * as Sentry from '@sentry/browser';

// DSN client : public par nature (embarqué dans le bundle du webview).
// Surchargeable via VITE_SENTRY_DSN au build.
const DSN =
  import.meta.env.VITE_SENTRY_DSN ??
  'https://4a866c6ecbcc0f5e04b8f766dd2aa143@o4509507471867904.ingest.de.sentry.io/4511881317711952';

export function initSentry(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    release: 'design-guardian-plugin@0.1.0',
    // Erreurs uniquement (intégrations par défaut : handlers globaux
    // onerror/onunhandledrejection). Pas de tracing ni replay : bundle léger
    // et périmètre réseau minimal (une seule origine ingest à autoriser).
  });
}
