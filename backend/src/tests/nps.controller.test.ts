import { describe, it, expect, vi } from 'vitest';

// Mock Supabase : projects → clé valide (projectId posé) ; nps_responses.insert → OK.
vi.mock('../config/supabase.js', () => {
  const projects = {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'proj-1', plan: 'free' }, error: null }) }) }),
  };
  const nps = { insert: async () => ({ error: null }) };
  return {
    getSupabaseClient: () => ({ from: (t: string) => (t === 'projects' ? projects : nps) }),
    getSupabaseStorage: () => ({ from: () => ({}) }),
  };
});

import { createApp } from '../app.js';

const H = { 'Content-Type': 'application/json', 'X-API-Key': 'valid-key' };
const post = (body: unknown, headers: Record<string, string> = H) =>
  createApp().request('/api/nps', { method: 'POST', headers, body: JSON.stringify(body) });

describe('POST /api/nps', () => {
  it('401 sans X-API-Key', async () => {
    const res = await post({ score: 9 }, { 'Content-Type': 'application/json' });
    expect(res.status).toBe(401);
  });

  it('201 pour un score valide (0–10)', async () => {
    const res = await post({ score: 9, comment: 'super', respondent: 'Alex' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('201 avec commentaire/respondent optionnels omis', async () => {
    const res = await post({ score: 7 });
    expect(res.status).toBe(201);
  });

  it('400 pour un score hors borne (>10)', async () => {
    const res = await post({ score: 11 });
    expect(res.status).toBe(400);
  });

  it('400 pour un score négatif', async () => {
    const res = await post({ score: -1 });
    expect(res.status).toBe(400);
  });

  it('400 pour un score non entier', async () => {
    const res = await post({ score: 7.5 });
    expect(res.status).toBe(400);
  });
});
