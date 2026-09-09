import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Supervision des 5xx *retournés* (pas *levés*).
 *
 * `app.onError` ne capte que les exceptions `throw`. Les handlers qui renvoient
 * proprement un 5xx (`c.json(err, 500)`, `/ping` 503 sur panne DB) passaient sous
 * le radar de Sentry — c'est l'angle mort qui a masqué la panne de capture du
 * 2026-09-09. Le middleware global doit désormais capter tout 5xx retourné.
 *
 * On force `/ping` à 503 en faisant échouer le select Supabase, puis on vérifie
 * que `Sentry.captureMessage` est appelé avec le statut + la route. Et qu'une 2xx
 * (`/health`, sans DB) ne capte rien.
 */
const sentryMocks = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  init: vi.fn(),
}));
vi.mock('@sentry/node', () => sentryMocks);

vi.mock('../config/supabase.js', () => ({
  getSupabaseClient: () => ({
    from: () => ({ select: () => ({ limit: async () => ({ error: { message: 'db down' } }) }) }),
  }),
  getSupabaseStorage: () => ({ from: () => ({}) }),
}));

import { createApp } from '../app.js';

describe('Sentry — capture des 5xx retournés', () => {
  beforeEach(() => vi.clearAllMocks());

  it('capture un message Sentry quand une route renvoie un 5xx (/ping 503, panne DB)', async () => {
    const app = createApp();
    const res = await app.request('/ping');
    expect(res.status).toBe(503);
    expect(sentryMocks.captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = sentryMocks.captureMessage.mock.calls[0];
    expect(message).toContain('503');
    expect(message).toContain('/ping');
    expect(context).toMatchObject({ level: 'error', tags: { http_status: '503' } });
  });

  it('ne capture rien pour une 2xx (/health)', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
  });
});
