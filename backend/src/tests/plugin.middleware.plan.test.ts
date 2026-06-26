import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';

vi.mock('../config/supabase.js', () => {
  const from = (table: string) => {
    if (table === 'projects') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', plan: 'free' }, error: null }) }) }) };
    if (table === 'device_links') return { select: () => ({ eq: () => ({ not: () => ({ maybeSingle: async () => ({ data: { profile_id: 'u1' }, error: null }) }) }) }) };
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan: 'pro' }, error: null }) }) }) }; // profiles
  };
  return { getSupabaseClient: () => ({ from }) };
});

describe('pluginMiddleware — plan via X-Link-Token', () => {
  it('override le plan projet (free) par le plan du compte lié (pro)', async () => {
    const app = new Hono();
    app.get('/t', pluginMiddleware, (c) => c.json({ plan: (c as unknown as { get: (k: string) => string }).get('plan') }));
    const res = await app.request('/t', { headers: { 'X-API-Key': 'k', 'X-Link-Token': 'tok' } });
    expect(await res.json()).toEqual({ plan: 'pro' });
  });
});
