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
 */
vi.mock('../config/supabase.js', () => {
  // Version belongs to a *different* project ('OTHER'), not to p1.
  const versionRow = { id: 'v1', status: 'draft', assets: { project_id: 'OTHER' } };
  const projectRow = { id: 'p1', plan: 'pro' };

  // Shared chainable thenable — all selector methods return `thenable` itself.
  // single()      → versionRow  (used by loadOwnedVersion)
  // maybeSingle() → projectRow  (used by pluginMiddleware on 'projects')
  type Thenable = {
    select: (...args: unknown[]) => Thenable;
    eq: (...args: unknown[]) => Thenable;
    not: (...args: unknown[]) => Thenable;
    order: (...args: unknown[]) => Thenable;
    limit: (...args: unknown[]) => Thenable;
    single: () => Promise<{ data: typeof versionRow; error: null }>;
    maybeSingle: () => Promise<{ data: typeof projectRow; error: null }>;
  };

  const thenable: Thenable = {
    select: () => thenable,
    eq: () => thenable,
    not: () => thenable,
    order: () => thenable,
    limit: () => thenable,
    single: async () => ({ data: versionRow, error: null }),
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

import { createApp } from '../app.js';

describe('PUT /api/branches/versions/:id/status — cross-tenant', () => {
  beforeEach(() => vi.clearAllMocks());

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
