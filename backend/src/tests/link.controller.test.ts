import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// /approve exige un JWT : sans Authorization → 401 (authMiddleware), avant toute logique.
vi.mock('../config/supabase.js', () => ({
  getSupabaseClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
  getSupabaseStorage: () => ({ from: () => ({}) }),
}));

import { createApp } from '../app.js';

describe('POST /api/link/approve — auth', () => {
  it('401 sans JWT', async () => {
    const app = createApp();
    const res = await app.request('/api/link/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'x' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/link/me — sans token', () => {
  it('renvoie linked:false / plan free', async () => {
    const app = createApp();
    const res = await app.request('/api/link/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ linked: false, plan: 'free' });
  });
});

describe('GET /api/link/pricing — redirection vers la page tarifs', () => {
  it('302 vers WEBAPP_URL/pricing', async () => {
    process.env.WEBAPP_URL = 'https://app.example.test';
    const { loadEnv } = await import('../config/env.js');
    loadEnv();
    const res = await createApp().request('/api/link/pricing');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://app.example.test/pricing');
  });

  it('503 si WEBAPP_URL n\'est pas configurée', async () => {
    process.env.WEBAPP_URL = '';
    const { loadEnv } = await import('../config/env.js');
    loadEnv();
    const res = await createApp().request('/api/link/pricing');
    expect(res.status).toBe(503);
  });
});
