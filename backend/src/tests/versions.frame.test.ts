import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * GET /api/versions/versions/:id?thumbs=1&frame=<clé> — diff d'UNE frame (page-centric) :
 * rendu de cette frame uniquement (jamais celui d'une autre, ni une reconstruction),
 * node_diffs filtrés sur la frame, cadres lus dans le résumé frames[] de la version
 * et de sa parente.
 */
type Row = Record<string, unknown>;
const st = vi.hoisted(() => ({ rows: {} as Record<string, Row>, stored: new Set<string>() }));

vi.mock('../config/supabase.js', () => {
  const from = (table: string) => {
    let id = '';
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { if (k === 'id' || k === 'api_key') id = String(v); return q; },
      maybeSingle: async () => ({ data: table === 'projects' ? { id: 'p1', plan: 'pro' } : null, error: null }),
      single: async () => ({ data: st.rows[id] ?? null, error: st.rows[id] ? null : { message: 'none' } }),
    };
    return q;
  };
  const storage = {
    from: () => ({
      createSignedUrl: async (path: string) => ({ data: st.stored.has(path) ? { signedUrl: `https://signed/${path}` } : null, error: null }),
      download: async () => ({ data: null, error: { message: 'none' } }),
    }),
  };
  return { getSupabaseClient: () => ({ from }), getSupabaseStorage: () => storage };
});

import { createApp } from '../app.js';

const frames = (a: { w: number; h: number }, b: { w: number; h: number }) => [
  { key: 'A', id: '1:1', name: 'Accueil', frame: a, status: 'modified', changes: 1 },
  { key: 'B', id: '1:2', name: 'Panier', frame: b, status: 'modified', changes: 1 },
];
const nd = (nodeId: string, viewport: string) => ({
  nodeId, nodeName: nodeId, nodeType: 'RECTANGLE', viewport, significance: 'notable',
  changes: [{ property: 'x', oldValue: 0, newValue: 5 }], bbox: { x: 0, y: 0, w: 1, h: 1 },
});
const delta = (f: ReturnType<typeof frames>) => ({
  modified: [nd('n-a', 'A'), nd('n-b', 'B')], added: [], removed: [], totalChanges: 2,
  metadata: { v1CapturedAt: '', v2CapturedAt: '', epsilon: 0.01, processingTimeMs: 0 }, frames: f,
});

beforeEach(() => {
  st.stored = new Set(['a1/main/v2_render_A.png', 'a1/main/v1_render_A.png', 'a1/main/v2_render.png']);
  st.rows = {
    v2: { id: 'v2', parent_id: 'v1', storage_path: 'a1/main/v2.json', status: 'draft', assets: { project_id: 'p1' },
          analysis_json: delta(frames({ w: 400, h: 800 }, { w: 300, h: 600 })) },
    v1: { id: 'v1', storage_path: 'a1/main/v1.json', analysis_json: delta(frames({ w: 390, h: 780 }, { w: 300, h: 600 })) },
  };
});

const get = (q: string) => createApp().request(`/api/versions/versions/v2?thumbs=1${q}`, { headers: { 'X-API-Key': 'k' } });

describe('GET /versions/:id?frame=', () => {
  it('ne renvoie que les changements, le rendu et les cadres de la frame demandée', async () => {
    const res = await get('&frame=A');
    expect(res.status).toBe(200);
    const body = await res.json() as {
      node_diffs: Array<{ nodeId: string }>; render_url: string | null; prev_render_url: string | null;
      current_frame: unknown; prev_frame: unknown;
    };
    expect(body.node_diffs.map(n => n.nodeId)).toEqual(['n-a']);
    expect(body.render_url).toBe('https://signed/a1/main/v2_render_A.png');
    expect(body.prev_render_url).toBe('https://signed/a1/main/v1_render_A.png');
    expect(body.current_frame).toEqual({ w: 400, h: 800 });
    expect(body.prev_frame).toEqual({ w: 390, h: 780 });
  });

  it('rendu de la frame absent → null (jamais le rendu d\'une autre frame ni une reconstruction)', async () => {
    const body = await (await get('&frame=B')).json() as { render_url: string | null };
    expect(body.render_url).toBeNull();
  });

  it('sans frame : comportement inchangé (rendu historique de la version)', async () => {
    const body = await (await get('')).json() as { render_url: string | null; node_diffs: unknown[] };
    expect(body.render_url).toBe('https://signed/a1/main/v2_render.png');
    expect(body.node_diffs).toHaveLength(2);
  });
});
