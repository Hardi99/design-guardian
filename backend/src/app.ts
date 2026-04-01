import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRouter } from './controllers/auth.controller.js';
import { projectsRouter } from './controllers/projects.controller.js';
import { assetsRouter } from './controllers/assets.controller.js';
import { checkpointsRouter } from './controllers/checkpoints.controller.js';
import { branchesRouter } from './controllers/branches.controller.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { registry } from './services/metrics.service.js';

const startTime = Date.now();

export function createApp() {
  const app = new Hono();

  app.use('*', logger());
  app.use('*', cors());
  app.use('*', metricsMiddleware);

  app.get('/', (c) =>
    c.json({ name: 'Design Guardian API', version: '1.0.0', status: 'running' }),
  );

  // Health check (no auth — used by Railway uptime checks)
  app.get('/health', (c) => c.json({
    status: 'ok',
    version: '1.0.0',
    uptime_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  }));

  // Prometheus metrics (no auth — scrapped by Prometheus server)
  app.get('/metrics', async (c) => {
    c.header('Content-Type', registry.contentType);
    return c.text(await registry.metrics());
  });

  // Pricing page
  app.get('/pricing', (c) => c.html(PRICING_HTML));

  app.route('/api/auth', authRouter);
  app.route('/api/projects', projectsRouter);
  app.route('/api/assets', assetsRouter);
  app.route('/api/checkpoints', checkpointsRouter);
  app.route('/api/branches', branchesRouter);

  return app;
}

// ─── Pricing page ─────────────────────────────────────────────────────────────

const PRICING_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Design Guardian — Tarifs</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #09090b; color: #f4f4f5; min-height: 100vh;
      display: flex; flex-direction: column; align-items: center;
      padding: 60px 24px;
    }
    .logo { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; color: #a855f7; margin-bottom: 48px; }
    h1 { font-size: 36px; font-weight: 700; text-align: center; margin-bottom: 12px; }
    .sub { color: #71717a; text-align: center; font-size: 16px; margin-bottom: 56px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; width: 100%; max-width: 860px; }
    .card {
      background: #18181b; border: 1px solid #27272a; border-radius: 16px;
      padding: 32px; display: flex; flex-direction: column; gap: 24px;
    }
    .card.featured { border-color: #a855f7; background: #18181b; position: relative; }
    .badge {
      position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
      background: #a855f7; color: white; font-size: 11px; font-weight: 700;
      padding: 4px 14px; border-radius: 99px; white-space: nowrap;
    }
    .plan-name { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; color: #71717a; text-transform: uppercase; }
    .price { font-size: 42px; font-weight: 700; }
    .price span { font-size: 16px; color: #71717a; font-weight: 400; }
    .features { list-style: none; display: flex; flex-direction: column; gap: 10px; flex: 1; }
    .features li { font-size: 14px; color: #a1a1aa; display: flex; align-items: center; gap: 8px; }
    .features li::before { content: "✓"; color: #a855f7; font-weight: 700; flex-shrink: 0; }
    .features li.no::before { content: "✕"; color: #3f3f46; }
    .features li.no { color: #3f3f46; }
    .btn {
      padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 600;
      cursor: pointer; text-align: center; border: none; text-decoration: none;
      display: block; transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: #a855f7; color: white; }
    .btn-secondary { background: #27272a; color: #f4f4f5; }
    .note { color: #52525b; font-size: 13px; text-align: center; margin-top: 40px; max-width: 480px; }
  </style>
</head>
<body>
  <p class="logo">✦ DESIGN GUARDIAN</p>
  <h1>Tarifs simples et transparents</h1>
  <p class="sub">Choisissez le plan qui correspond à votre usage.</p>

  <div class="grid">
    <div class="card">
      <p class="plan-name">Free</p>
      <p class="price">0 €<span> / mois</span></p>
      <ul class="features">
        <li>1 projet Figma</li>
        <li>10 checkpoints max</li>
        <li>1 branche</li>
        <li>Diff géométrique 0,01px</li>
        <li>AI Patch Note</li>
        <li class="no">Historique illimité</li>
        <li class="no">Multi-branches</li>
        <li class="no">Export rapports</li>
      </ul>
      <a class="btn btn-secondary" href="#">Commencer gratuitement</a>
    </div>

    <div class="card featured">
      <span class="badge">Populaire</span>
      <p class="plan-name">Pro</p>
      <p class="price">8 €<span> / mois</span></p>
      <ul class="features">
        <li>Projets illimités</li>
        <li>Checkpoints illimités</li>
        <li>Branches illimitées</li>
        <li>Diff géométrique 0,01px</li>
        <li>AI Patch Note</li>
        <li>Historique complet</li>
        <li>Gold Status & workflow QA</li>
        <li class="no">Export rapports</li>
      </ul>
      <a class="btn btn-primary" href="#">Passer à Pro</a>
    </div>

    <div class="card">
      <p class="plan-name">Team</p>
      <p class="price">20 €<span> / user / mois</span></p>
      <ul class="features">
        <li>Tout Pro</li>
        <li>Multi-designers</li>
        <li>Permissions par rôle</li>
        <li>Export rapports PDF</li>
        <li>Support prioritaire</li>
        <li>Dashboard équipe</li>
        <li>SSO (bientôt)</li>
        <li>SLA 99,9 %</li>
      </ul>
      <a class="btn btn-secondary" href="#">Contacter l'équipe</a>
    </div>
  </div>

  <p class="note">Paiement sécurisé. Annulation à tout moment. TVA européenne incluse automatiquement.</p>
</body>
</html>`;
