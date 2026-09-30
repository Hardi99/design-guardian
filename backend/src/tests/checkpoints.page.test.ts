import { describe, it, expect, vi } from 'vitest';

/**
 * POST /api/checkpoints — v1 d'une PAGE : sans version précédente il n'y a pas de diff, mais
 * la version doit porter le résumé de ses frames (toutes « initial »), et la réponse doit
 * dire au plugin quelles frames rendre. createVersionAtomic est simulé : il appelle le
 * vrai computeMeta du contrôleur avec prev = null (première version).
 */
vi.mock('../config/supabase.js', () => {
  const from = (table: string) => {
    if (table === 'projects') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', plan: 'pro' }, error: null }) }) }) };
    }
    // 'assets' : l'asset appartient au projet
    return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { id: 'a1', project_id: 'p1', name: 'A' }, error: null }) }) }) }) };
  };
  return { getSupabaseClient: () => ({ from }), getSupabaseStorage: () => ({ from: () => ({}) }) };
});

vi.mock('../services/versioning.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/versioning.service.js')>();
  return {
    ...actual,
    createVersionAtomic: async (_db: unknown, _st: unknown, input: { computeMeta: (p: null) => Promise<{ analysisJson: unknown; aiSummary: string | null }> }) => {
      const meta = await input.computeMeta(null);
      return { ok: true, version: { id: 'v1', version_number: 1, ai_summary: meta.aiSummary }, prev: null, analysisJson: meta.analysisJson };
    },
  };
});

import { createApp } from '../app.js';

const node = (id: string, dg: string, type = 'FRAME') => ({
  id, dg_id: dg, name: id, type, x: 0, y: 0, width: 100, height: 50, opacity: 1, fills: [], strokes: [], children: [],
});

const post = (root: Record<string, unknown>) => createApp().request('/api/checkpoints', {
  method: 'POST',
  headers: { 'X-API-Key': 'k', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    asset_id: '00000000-0000-4000-8000-000000000000', branch_name: 'main',
    snapshot_json: { figmaNodeId: 'p', figmaNodeName: 'Page', capturedAt: '2026-09-30T00:00:00Z', root },
    author: { figma_id: 'f', name: 'A' },
  }),
});

describe('POST /api/checkpoints — v1 de page', () => {
  it('analysis porte frames (initial) et la réponse liste les frames à rendre', async () => {
    const res = await post({ ...node('p', 'DG-P', 'PAGE'), width: 0, height: 0, children: [node('1:1', 'A'), node('1:2', 'B')] });
    expect(res.status).toBe(201);
    const body = await res.json() as {
      analysis: { frames?: Array<{ key: string; status: string }> } | null;
      render_frames: Array<{ key: string; id: string }>;
    };
    expect(body.analysis?.frames?.map(f => [f.key, f.status])).toEqual([['A', 'initial'], ['B', 'initial']]);
    expect(body.render_frames).toEqual([{ key: 'A', id: '1:1' }, { key: 'B', id: '1:2' }]);
  });

  it('v1 en mode frame (racine non-PAGE) : pas de résumé, aucune frame à rendre', async () => {
    const res = await post(node('f', 'DG-F'));
    const body = await res.json() as { analysis: unknown; render_frames: unknown[] };
    expect(body.analysis).toBeNull();
    expect(body.render_frames).toEqual([]);
  });
});
