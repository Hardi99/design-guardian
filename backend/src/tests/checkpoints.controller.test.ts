import { describe, it, expect, vi } from 'vitest';

/**
 * Integration test: POST /api/checkpoints — free-plan checkpoint limit (10 max / asset).
 *
 * Call chain under test:
 *  1. pluginMiddleware  → from('projects').select('id,plan').eq(api_key).maybeSingle()
 *                         → { id:'p1', plan:'free' }
 *  2. zValidator(createCheckpointSchema) → body valid
 *  3. Asset ownership → from('assets').select(...).eq(id).eq(project_id).single()
 *                         → { id:'a1', project_id:'p1', name:'A' }  (asset exists, passes)
 *  4. Plan check: plan==='free' → from('versions').select('id',{count:'exact',head:true}).eq(asset_id)
 *                         → { count:10 }  →  10 >= 10  → 403
 *
 * Meaningfulness: if the free-plan branch (`if (c.get('plan') === 'free')`) were removed,
 * execution would proceed to createVersionAtomic and return 201. This test would fail →
 * the limit guard is proven.
 */
vi.mock('../config/supabase.js', () => {
  const projectRow = { id: 'p1', plan: 'free' };
  const assetRow   = { id: 'a1', project_id: 'p1', name: 'A' };

  const from = (table: string) => {
    if (table === 'projects') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: projectRow, error: null }),
          }),
        }),
      };
    }
    if (table === 'assets') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: assetRow, error: null }),
            }),
          }),
        }),
      };
    }
    // 'versions' — count = 10 (limit already reached)
    return {
      select: () => ({
        eq: async () => ({ count: 10, error: null }),
      }),
    };
  };

  return {
    getSupabaseClient: () => ({ from }),
    getSupabaseStorage: () => ({ from: () => ({}) }),
  };
});

import { createApp } from '../app.js';

// Minimal valid FigmaSnapshot that satisfies createCheckpointSchema's figmaSnapshotSchema.
const snapshot = {
  figmaNodeId: 'n',
  figmaNodeName: 'N',
  capturedAt: 't',
  root: {
    id: 'r', name: 'N', type: 'FRAME',
    x: 0, y: 0, width: 1, height: 1,
    opacity: 1,
    fills: [],
    strokes: [],
  },
};

describe('POST /api/checkpoints — free-plan limit', () => {
  it('returns 403 when the asset already has 10 checkpoints on the free plan', async () => {
    const app = createApp();
    const res = await app.request('/api/checkpoints', {
      method: 'POST',
      headers: { 'X-API-Key': 'k', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_id: '00000000-0000-0000-0000-000000000000',
        branch_name: 'main',
        snapshot_json: snapshot,
        author: { figma_id: 'f', name: 'A' },
      }),
    });
    expect(res.status).toBe(403);
  });
});
