import { Hono } from 'hono';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import {
  sendEmail,
  sendCheckpointNotification,
  sendVerificationSms,
} from '../services/notification.service.js';
import type { ErrorResponse } from '../types/api.js';
import type { ProjectEnv } from '../types/hono.js';

const notificationsRouter = new Hono<ProjectEnv>();

/**
 * POST /api/notifications/checkpoint
 * Notifies collaborators when a new checkpoint is saved.
 * Called by the plugin after a successful checkpoint creation.
 */
notificationsRouter.post('/checkpoint', pluginMiddleware, async (c) => {
  const body = await c.req.json<{
    to: string;
    authorName: string;
    projectName: string;
    branchName: string;
    versionNumber: number;
    aiSummary?: string | null;
  }>();

  if (!body.to || !body.authorName || !body.projectName) {
    return c.json<ErrorResponse>({ error: 'to, authorName, projectName required' }, 400);
  }

  const result = await sendCheckpointNotification({ ...body, aiSummary: body.aiSummary ?? null });
  if (!result.sent) return c.json({ sent: false, error: result.error }, 200);
  return c.json({ sent: true, id: result.id }, 200);
});

/**
 * POST /api/notifications/sms/verify
 * Sends a verification code via SMS (password reset / 2FA).
 */
notificationsRouter.post('/sms/verify', pluginMiddleware, async (c) => {
  const { to, code } = await c.req.json<{ to: string; code: string }>();
  if (!to || !code) return c.json<ErrorResponse>({ error: 'to and code required' }, 400);

  const result = await sendVerificationSms(to, code);
  if (!result.sent) return c.json({ sent: false, error: result.error }, 200);
  return c.json({ sent: true, sid: result.sid }, 200);
});

/**
 * POST /api/notifications/test
 * Sends a test email — useful during demo/jury to prove the integration works.
 */
notificationsRouter.post('/test', pluginMiddleware, async (c) => {
  const { to } = await c.req.json<{ to: string }>();
  if (!to) return c.json<ErrorResponse>({ error: 'to required' }, 400);

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
