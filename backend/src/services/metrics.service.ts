import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// ─── Registry isolé (évite les conflits entre instances en test) ──────────────

export const registry = new Registry();
registry.setDefaultLabels({ app: 'design-guardian' });
collectDefaultMetrics({ register: registry });

// ─── Compteurs métier ─────────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Durée des requêtes HTTP en millisecondes',
  labelNames: ['method', 'route', 'status'],
  buckets: [10, 50, 100, 200, 500, 1000, 3000],
  registers: [registry],
});

export const checkpointsCreatedTotal = new Counter({
  name: 'checkpoints_created_total',
  help: 'Nombre de checkpoints créés',
  registers: [registry],
});

export const aiSummariesGeneratedTotal = new Counter({
  name: 'ai_summaries_generated_total',
  help: 'Nombre de patch notes générés par GPT-4o-mini',
  labelNames: ['status'], // success | fallback
  registers: [registry],
});

export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Connexions HTTP actives',
  registers: [registry],
});
