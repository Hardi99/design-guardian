import { describe, it, expect } from 'vitest';
import { loadOwnedVersion } from '../services/ownership.service.js';
import { singleRowDb } from './_support/supabase-stub.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const asDb = (row: unknown) => singleRowDb(row) as unknown as SupabaseClient;

describe('loadOwnedVersion', () => {
  it('renvoie la version (sans assets) quand le projet correspond', async () => {
    const row = { id: 'v1', status: 'draft', assets: { project_id: 'p1' } };
    const res = await loadOwnedVersion(asDb(row), 'v1', 'p1');
    expect(res).toEqual({ version: { id: 'v1', status: 'draft' } });
  });

  it('renvoie forbidden quand le projet diffère', async () => {
    const row = { id: 'v1', assets: { project_id: 'OTHER' } };
    const res = await loadOwnedVersion(asDb(row), 'v1', 'p1');
    expect(res).toEqual({ error: 'forbidden' });
  });

  it('renvoie not_found quand la version est absente', async () => {
    const res = await loadOwnedVersion(asDb(null), 'v1', 'p1');
    expect(res).toEqual({ error: 'not_found' });
  });
});
