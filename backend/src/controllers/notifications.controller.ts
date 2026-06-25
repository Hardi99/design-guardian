import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import {
  sendEmail,
  sendCheckpointNotification,
  sendVerificationSms,
} from '../services/notification.service.js';
import type { ErrorResponse } from '../types/api.js';
import type { ProjectEnv } from '../types/hono.js';

const notificationsRouter = new Hono<ProjectEnv>();

// Anti-abus : ces routes déclenchent un coût externe (Resend/Twilio) et l'API key
// s'obtient librement via /auto-init. Plafond glissant par projet (mémoire process).
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1h
const _bucket = new Map<string, { n: number; resetAt: number }>();
function rateLimited(projectId: string): boolean {
  const now = Date.now();
  const b = _bucket.get(projectId);
  if (!b || b.resetAt < now) { _bucket.set(projectId, { n: 1, resetAt: now + RATE_WINDOW_MS }); return false; }
  if (b.n >= RATE_MAX) return true;
  b.n++;
  return false;
}

const checkpointBody = z.object({
  to: z.string().email(),
  authorName: z.string().min(1),
  projectName: z.string().min(1),
  branchName: z.string().min(1),
  versionNumber: z.number(),
  aiSummary: z.string().nullable().optional(),
});

notificationsRouter.post('/checkpoint', pluginMiddleware, zValidator('json', checkpointBody), async (c) => {
  if (rateLimited(c.get('projectId'))) return c.json<ErrorResponse>({ error: 'Rate limit exceeded' }, 429);
  const body = c.req.valid('json');
  const result = await sendCheckpointNotification({ ...body, aiSummary: body.aiSummary ?? null });
  if (!result.sent) return c.json({ sent: false, error: result.error }, 200);
  return c.json({ sent: true, id: result.id }, 200);
});

// Code de vérification : généré CÔTÉ SERVEUR (jamais reçu du client) pour éviter
// le relais SMS ouvert. On renvoie uniquement le statut d'envoi.
const smsBody = z.object({ to: z.string().min(5).max(20) });

notificationsRouter.post('/sms/verify', pluginMiddleware, zValidator('json', smsBody), async (c) => {
  if (rateLimited(c.get('projectId'))) return c.json<ErrorResponse>({ error: 'Rate limit exceeded' }, 429);
  const { to } = c.req.valid('json');
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 chiffres
  const result = await sendVerificationSms(to, code);
  if (!result.sent) return c.json({ sent: false, error: result.error }, 200);
  // NB : la vérification du code est portée par Supabase Phone OTP côté frontend ;
  // cette route reste un utilitaire de démo. Le code n'est pas renvoyé au client.
  return c.json({ sent: true, sid: result.sid }, 200);
});

const testBody = z.object({ to: z.string().email() });

notificationsRouter.post('/test', pluginMiddleware, zValidator('json', testBody), async (c) => {
  if (rateLimited(c.get('projectId'))) return c.json<ErrorResponse>({ error: 'Rate limit exceeded' }, 429);
  const { to } = c.req.valid('json');
  const result = await sendEmail(
    to,
    '[Design Guardian] Test de notification',
    `<div style="font-family:sans-serif;padding:24px">
      <h2>✅ Notifications opérationnelles</h2>
      <p>Le service de notifications Design Guardian fonctionne correctement.</p>
    </div>`,
  );
  return c.json({ sent: result.sent, id: result.id, error: result.error }, 200);
});

export { notificationsRouter };
