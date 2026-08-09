import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test: POST /api/projects/auto-init — response includes assets (task 2).
 *
 * Call chain under test:
 *  1. from('projects').select(...).eq('figma_file_key', ...).maybeSingle()
 *                         → existing project row { id:'p1', name:'F', plan:'free', api_key:'k1' }
 *  2. loadAssets(db, 'p1') → from('assets').select('*').eq('project_id', 'p1')
 *                            .order('created_at', { ascending: false })
 *                         → 2 mocked asset rows
 *
 * Meaningfulness: if the handler stopped returning `assets` (i.e. dropped the
 * loadAssets call on the existing-project path), `body.assets` would be undefined
 * and this test would fail on the length assertion.
 */
const mockState = vi.hoisted(() => ({
  assetRows: [
    { id: 'a1', project_id: 'p1', name: 'Logo', description: null, asset_type: 'logo', created_at: '2026-01-01T00:00:00Z', updated_at: null },
    { id: 'a2', project_id: 'p1', name: 'Icon', description: null, asset_type: 'icon', created_at: '2026-01-02T00:00:00Z', updated_at: null },
  ] as Record<string, unknown>[],
}));

vi.mock('../config/supabase.js', () => {
  const projectRow = { id: 'p1', name: 'F', plan: 'free', api_key: 'k1' };

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
            order: async () => ({ data: mockState.assetRows, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  };

  return {
    getSupabaseClient: () => ({ from }),
    getSupabaseStorage: () => ({ from: () => ({}) }),
  };
});

import { createApp } from '../app.js';

describe('POST /api/projects/auto-init — includes assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns assets alongside api_key and project for an existing project', async () => {
    const app = createApp();
    const res = await app.request('/api/projects/auto-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ figma_file_key: 'f1', figma_file_name: 'F' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { api_key: string; project: { id: string }; assets: unknown[] };
    expect(body.api_key).toBe('k1');
    expect(body.project.id).toBe('p1');
    expect(Array.isArray(body.assets)).toBe(true);
    expect(body.assets).toHaveLength(2);
  });
});
