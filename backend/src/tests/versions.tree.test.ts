import { describe, it, expect, vi } from 'vitest';

/**
 * GET /api/versions/tree — page-centric : chaque version porte le résumé de ses frames
 * (extrait JSON `analysis_json->frames`, pas le delta entier) pour que le plugin calcule
 * l'historique d'une frame sans autre appel.
 */
const st = vi.hoisted(() => ({ versionsSelect: '' }));

vi.mock('../config/supabase.js', () => {
  const frames = [{ key: 'A', id: '1:1', name: 'Accueil', frame: { w: 1, h: 1 }, status: 'initial', changes: 0 }];
  const from = (table: string) => {
    const q = {
      select: (cols: string) => { if (table === 'versions') st.versionsSelect = cols; return q; },
      eq: () => q,
      order: () => q,
      maybeSingle: async () => ({ data: { id: 'p1', plan: 'pro' }, error: null }),
      single: async () => ({ data: { id: 'a1' }, error: null }),
      then: (res: (v: { data: unknown[]; error: null }) => unknown) =>
        res({ data: [{ id: 'v1', branch_name: 'main', frames }], error: null }),
    };
    return q;
  };
  return { getSupabaseClient: () => ({ from }), getSupabaseStorage: () => ({ from: () => ({}) }) };
});

import { createApp } from '../app.js';

describe('GET /api/versions/tree — résumé des frames', () => {
  it('demande l\'extrait analysis_json->frames et le transmet', async () => {
    const res = await createApp().request('/api/versions/tree?asset_id=a1', { headers: { 'X-API-Key': 'k' } });
    expect(res.status).toBe(200);
    expect(st.versionsSelect).toContain('frames:analysis_json->frames');
    expect(st.versionsSelect).not.toMatch(/(^|,\s*)analysis_json(\s*,|$)/); // jamais le delta entier
    const body = await res.json() as { versions: Array<{ frames: Array<{ key: string }> }> };
    expect(body.versions[0].frames[0].key).toBe('A');
  });
});
