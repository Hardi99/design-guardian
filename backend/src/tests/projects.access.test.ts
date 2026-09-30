import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Contrôle d'accès aux projets.
 *  1. auto-init : l'identifiant de fichier fait office de secret (il donne la clé d'API).
 *     Seul l'id aléatoire posé par le plugin (32 hex) est accepté ; une clé devinable
 *     (clé d'URL Figma, id de nœud « 0:1 ») est refusée AVANT toute lecture en base.
 *  2. GET /api/projects/:id : un utilisateur connecté ne lit que SES projets.
 */
const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  queried: 0,
}));

vi.mock('../config/supabase.js', () => {
  // Query builder minimal : applique les .eq() comme filtres sur db.rows.
  const query = () => {
    const filters: [string, unknown][] = [];
    const run = () => db.rows.filter(r => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      order: async () => ({ data: [], error: null }),
      maybeSingle: async () => { db.queried++; return { data: run()[0] ?? null, error: null }; },
      single: async () => {
        db.queried++;
        const r = run()[0];
        return r ? { data: r, error: null } : { data: null, error: { message: 'no rows' } };
      },
    };
    return q;
  };
  return {
    getSupabaseClient: () => ({ from: () => query() }),
    getSupabaseStorage: () => ({ from: () => ({}) }),
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'alice' } }, error: null }) },
  }),
}));

import { createApp } from '../app.js';

const autoInit = (figma_file_key: string) =>
  createApp().request('/api/projects/auto-init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figma_file_key, figma_file_name: 'F' }),
  });

describe('auto-init — identifiant de fichier', () => {
  beforeEach(() => {
    db.queried = 0;
    db.rows = [{ id: 'p1', name: 'F', plan: 'free', api_key: 'k1', figma_file_key: '0:1' }];
  });

  it('refuse un id de nœud devinable (« 0:1 ») sans interroger la base', async () => {
    const res = await autoInit('0:1');
    expect(res.status).toBe(400);
    expect(db.queried).toBe(0);
  });

  it('refuse une clé d\'URL Figma (lisible dans tout lien de partage)', async () => {
    const res = await autoInit('AbCdEfGhIjKlMnOpQr');
    expect(res.status).toBe(400);
    expect(db.queried).toBe(0);
  });

  it('accepte l\'id aléatoire du plugin (32 hex)', async () => {
    db.rows = [{ id: 'p2', name: 'F', plan: 'free', api_key: 'k2', figma_file_key: 'f'.repeat(32) }];
    const res = await autoInit('f'.repeat(32));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/projects/:id — propriétaire uniquement', () => {
  beforeEach(() => {
    db.rows = [
      { id: 'p-alice', owner_id: 'alice', name: 'A', api_key: 'ka' },
      { id: 'p-bob', owner_id: 'bob', name: 'B', api_key: 'kb' },
    ];
  });

  const get = (id: string) =>
    createApp().request(`/api/projects/${id}`, { headers: { Authorization: 'Bearer t' } });

  it('404 sur le projet d\'un autre utilisateur (et sa clé d\'API n\'est pas renvoyée)', async () => {
    const res = await get('p-bob');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('kb');
  });

  it('200 sur son propre projet', async () => {
    const res = await get('p-alice');
    expect(res.status).toBe(200);
  });
});
