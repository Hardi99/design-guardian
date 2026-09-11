import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test: POST /api/checkpoints/:id/render — upload différé du rendu (option A).
 *
 * Le nouveau plugin ne met plus le render dans le POST /checkpoints (chemin critique) :
 * il l'envoie ensuite ici, en arrière-plan. L'endpoint doit :
 *  - vérifier l'ownership (version ∈ projet de la X-API-Key), sinon 404 ;
 *  - uploader le rendu au path dérivé du storage_path de la version ;
 *  - rester best-effort côté client mais renvoyer une erreur claire si l'upload échoue.
 */
const state = vi.hoisted(() => ({
  versionRow: null as Record<string, unknown> | null,
  uploadError: null as { message: string } | null,
  uploadCalls: [] as unknown[][],
}));

vi.mock('../config/supabase.js', () => {
  const projectRow = { id: 'p1', plan: 'pro' };
  const from = (table: string) => {
    if (table === 'projects') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: projectRow, error: null }) }) }) };
    }
    // 'versions' : select().eq('id').eq('assets.project_id').single()
    return {
      select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: state.versionRow, error: state.versionRow ? null : { message: 'not found' } }) }) }) }),
    };
  };
  const storageUpload = (...args: unknown[]) => { state.uploadCalls.push(args); return Promise.resolve({ error: state.uploadError }); };
  return {
    getSupabaseClient: () => ({ from }),
    getSupabaseStorage: () => ({ from: () => ({ upload: storageUpload }) }),
  };
});

import { createApp } from '../app.js';

const post = (id: string, body: unknown) =>
  createApp().request(`/api/checkpoints/${id}/render`, {
    method: 'POST',
    headers: { 'X-API-Key': 'k', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/checkpoints/:id/render', () => {
  beforeEach(() => { state.versionRow = null; state.uploadError = null; state.uploadCalls = []; });

  it('upload le rendu au path dérivé quand la version appartient au projet', async () => {
    state.versionRow = { storage_path: 'a1/main/v2.json', assets: { project_id: 'p1' } };
    const res = await post('v2', { render_svg_b64: Buffer.from('<svg/>').toString('base64'), render_kind: 'svg' });
    expect(res.status).toBe(200);
    expect(state.uploadCalls).toHaveLength(1);
    expect(state.uploadCalls[0][0]).toBe('a1/main/v2_render.svg');
  });

  it('renvoie 404 si la version est introuvable / hors projet', async () => {
    state.versionRow = null;
    const res = await post('v2', { render_svg_b64: 'AA==', render_kind: 'svg' });
    expect(res.status).toBe(404);
    expect(state.uploadCalls).toHaveLength(0);
  });
});
