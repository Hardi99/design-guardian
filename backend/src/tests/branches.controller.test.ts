import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test: PUT /api/branches/versions/:id/status — cross-tenant ownership guard (fix A1).
 *
 * Call chain under test:
 *  1. pluginMiddleware  → from('projects').select('id,plan').eq(api_key).maybeSingle()
 *                         → { id:'p1', plan:'pro' }  (project owned by this key)
 *  2. zValidator(statusSchema) → body { status:'approved' } → valid
 *  3. loadOwnedVersion → from('versions').select('*,assets!inner(project_id)').eq('id',id).single()
 *                         → { id:'v1', assets:{ project_id:'OTHER' } }
 *  4. 'OTHER' !== 'p1'  → { error:'forbidden' } → 403
 *
 * Meaningfulness: if the ownership check in loadOwnedVersion were removed (i.e. it
 * returned { version } unconditionally), the handler would continue to the DB update
 * and return 2xx. This test would fail → the guard is proven.
 *
 * `mockState.versionRow` is mutable (vi.hoisted) so the GET /versions/:id test below
 * (task 5) can swap in a different row — with a matching project_id and a geometry-
 * bearing analysis_json — without a second, conflicting vi.mock('../config/supabase.js', ...).
 */
const mockState = vi.hoisted(() => ({
  versionRow: { id: 'v1', status: 'draft', assets: { project_id: 'OTHER' } } as Record<string, unknown>,
}));

vi.mock('../config/supabase.js', () => {
  const projectRow = { id: 'p1', plan: 'pro' };

  // Shared chainable thenable — all selector methods return `thenable` itself.
  // single()      → mockState.versionRow  (used by loadOwnedVersion / GET handler)
  // maybeSingle() → projectRow            (used by pluginMiddleware on 'projects')
  type Thenable = {
    select: (...args: unknown[]) => Thenable;
    eq: (...args: unknown[]) => Thenable;
    not: (...args: unknown[]) => Thenable;
    order: (...args: unknown[]) => Thenable;
    limit: (...args: unknown[]) => Thenable;
    single: () => Promise<{ data: Record<string, unknown>; error: null }>;
    maybeSingle: () => Promise<{ data: typeof projectRow; error: null }>;
  };

  const thenable: Thenable = {
    select: () => thenable,
    eq: () => thenable,
    not: () => thenable,
    order: () => thenable,
    limit: () => thenable,
    single: async () => ({ data: mockState.versionRow, error: null }),
    maybeSingle: async () => ({ data: projectRow, error: null }),
  };

  // For 'projects': both single() and maybeSingle() must resolve to projectRow.
  // select() still returns `thenable` so the chain works; the overrides below are
  // reached only when called directly on the from('projects') result (dead in practice
  // because the chain goes through thenable) — but the thenable itself already serves
  // the right row per method.
  const from = (table: string) =>
    table === 'projects'
      ? {
          ...thenable,
          maybeSingle: async () => ({ data: projectRow, error: null }),
          single: async () => ({ data: projectRow, error: null }),
        }
      : thenable;

  return {
    getSupabaseClient: () => ({ from }),
    getSupabaseStorage: () => ({ from: () => ({}) }),
  };
});

// Spy on resolveSnapshot while keeping the rest of the real module — lets the task-5
// test assert "no snapshot download happened" without a Storage mock at all.
const versioningMocks = vi.hoisted(() => ({
  resolveSnapshot: vi.fn(async () => null),
}));
vi.mock('../services/versioning.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/versioning.service.js')>();
  return { ...actual, resolveSnapshot: versioningMocks.resolveSnapshot };
});

import { createApp } from '../app.js';

describe('PUT /api/branches/versions/:id/status — cross-tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.versionRow = { id: 'v1', status: 'draft', assets: { project_id: 'OTHER' } };
  });

  it('returns 403 when the version belongs to a different project (ownership guard)', async () => {
    const app = createApp();
    const res = await app.request('/api/branches/versions/v1/status', {
      method: 'PUT',
      headers: { 'X-API-Key': 'key-of-p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    expect(res.status).toBe(403);
  });
});

/**
 * GET /api/branches/versions/:id — stored geometry + significance (task 5, subsumes B1;
 * significance stamping added in the T5 correction round).
 *
 * `analysis_json` (DeltaJSON) already carries `frame` + per-node `bbox` + per-modified-node
 * `significance` when written by stampSignificance/enrichDeltaGeometry at checkpoint-creation
 * time. On ?thumbs=1 the handler must read that geometry AND that significance straight from
 * the row instead of downloading the snapshot from Storage (which would be needed to rebuild
 * the parent/child tree for cascade-move detection) — resolveSnapshot must NOT be called on
 * this path.
 *
 * Limitation: we assert non-invocation of `resolveSnapshot` directly (spied via the real
 * versioning.service module) rather than inspecting Storage HTTP calls, since the
 * existing supabase mock in this file has no Storage download implementation at all —
 * if the handler *did* fall through to resolveSnapshot's real code it would throw
 * (no storage_path branch executes safely with the current mock),
 * which would also fail the test, just less legibly than the explicit spy assertion.
 */
describe('GET /api/branches/versions/:id — stored geometry (no snapshot download)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.versionRow = {
      id: 'v2',
      version_number: 3,
      branch_name: 'main',
      status: 'draft',
      parent_id: null,
      storage_path: null,
      analysis_json: {
        modified: [
          {
            nodeId: 'n1', nodeName: 'Rect', nodeType: 'RECTANGLE',
            changes: [{ property: 'x', oldValue: 0, newValue: 10 }],
            bbox: { x: 1, y: 2, w: 30, h: 40 },
            significance: 'notable',
          },
          // Large x move (would score 'notable' by magnitude alone, cf. SIGNIFICANCE_THRESHOLDS)
          // but stamped 'minor' at capture (cascade move carried by a moved parent). Proves the
          // GET path TRUSTS the stored value instead of recomputing from scratch.
          {
            nodeId: 'n2', nodeName: 'Child', nodeType: 'RECTANGLE',
            changes: [{ property: 'x', oldValue: 0, newValue: 50 }],
            bbox: { x: 5, y: 6, w: 10, h: 10 },
            significance: 'minor',
          },
        ],
        added: [],
        removed: [],
        totalChanges: 2,
        metadata: { v1CapturedAt: '2026-01-01T00:00:00Z', v2CapturedAt: '2026-01-02T00:00:00Z', epsilon: 0.01, processingTimeMs: 5 },
        frame: { w: 800, h: 600 },
      },
      assets: { project_id: 'p1' }, // matches pluginMiddleware's projectRow.id → not 403
    };
  });

  it('reads stored frame/bbox/significance without downloading a snapshot', async () => {
    const app = createApp();
    const res = await app.request('/api/branches/versions/v2?thumbs=1', {
      headers: { 'X-API-Key': 'key-of-p1' },
    });

    expect(res.status).toBe(200);
    expect(versioningMocks.resolveSnapshot).not.toHaveBeenCalled();

    const body = await res.json() as {
      current_frame: { w: number; h: number } | null;
      node_diffs: Array<{
        nodeId: string;
        significance: 'notable' | 'minor';
        after_bbox: { x: number; y: number; w: number; h: number } | null;
      }>;
    };
    expect(body.current_frame).toEqual({ w: 800, h: 600 });

    const n1 = body.node_diffs.find(n => n.nodeId === 'n1');
    expect(n1?.after_bbox).toEqual({ x: 1, y: 2, w: 30, h: 40 });
    expect(n1?.significance).toBe('notable');

    const n2 = body.node_diffs.find(n => n.nodeId === 'n2');
    expect(n2?.significance).toBe('minor');
  });
});
