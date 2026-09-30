import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Routes de séparation d'un fichier (cf. split.service) :
 *  - GET  /api/assets/identities : nœud Figma + dg_id de la dernière capture de chaque asset,
 *    pour que le plugin vérifie leur présence dans le fichier ouvert ;
 *  - POST /api/projects/split    : nouveau projet pour ce fichier + déplacement des assets
 *    demandés, uniquement s'ils appartiennent au projet courant.
 */
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

vi.mock('../config/supabase.js', () => {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    const rows = () => (db.tables[table] ??= []);
    const run = (): Row[] => {
      if (op === 'insert') {
        const r = { id: `${table}-${rows().length + 1}`, plan: 'free', api_key: `key-${rows().length + 1}`, ...payload };
        rows().push(r);
        return [r];
      }
      const hit = rows().filter(r => filters.every(f => f(r)));
      if (op === 'update') hit.forEach(r => Object.assign(r, payload));
      return hit;
    };
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { filters.push(r => vs.includes(r[k])); return q; },
      not: () => q,
      order: () => q,
      insert: (p: Row) => { op = 'insert'; payload = p; return q; },
      update: (p: Row) => { op = 'update'; payload = p; return q; },
      single: async () => { const r = run()[0]; return r ? { data: r, error: null } : { data: null, error: { message: 'none' } }; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: run(), error: null }),
    };
    return q;
  };
  return { getSupabaseClient: () => ({ from }), getSupabaseStorage: () => ({ from: () => ({}) }) };
});

vi.mock('../services/versioning.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/versioning.service.js')>();
  return {
    ...actual,
    downloadSnapshot: async (_s: unknown, path: string) =>
      ({ root: { dg_id: `dg-of-${path}` } }),
  };
});

import { createApp } from '../app.js';

const NEW_ID = 'c'.repeat(32);
// Ids d'assets au format réel (UUID) : le schéma les valide.
const G1 = '00000000-0000-4000-8000-0000000000a1'; // élément de Gynger
const T1 = '00000000-0000-4000-8000-0000000000b1'; // élément de « test »
const X1 = '00000000-0000-4000-8000-0000000000c1'; // élément d'un autre projet
const headers = { 'X-API-Key': 'shared-key', 'Content-Type': 'application/json' };

beforeEach(() => {
  db.tables = {
    projects: [
      { id: 'shared', plan: 'free', api_key: 'shared-key', figma_file_key: 'a'.repeat(32), name: 'test' },
      { id: 'other', plan: 'free', api_key: 'other-key', figma_file_key: 'b'.repeat(32), name: 'autre' },
    ],
    assets: [
      { id: G1, project_id: 'shared', name: 'Gynger 1' },
      { id: T1, project_id: 'shared', name: 'Test 1' },
      { id: X1, project_id: 'other', name: 'Autre 1' },
    ],
    versions: [
      { asset_id: G1, figma_node_id: '17305:2208', storage_path: 'g1/main/v2.json', created_at: '2026-09-22T00:00:00Z' },
      { asset_id: G1, figma_node_id: '17305:1',    storage_path: 'g1/main/v1.json', created_at: '2026-09-01T00:00:00Z' },
      { asset_id: T1, figma_node_id: '116:21',     storage_path: 't1/main/v1.json', created_at: '2026-09-30T00:00:00Z' },
    ],
  };
});

describe('GET /api/assets/identities', () => {
  it('renvoie nœud + dg_id de la dernière capture des assets du projet courant uniquement', async () => {
    const res = await createApp().request('/api/assets/identities', { headers });
    expect(res.status).toBe(200);
    const body = await res.json() as { identities: Array<{ asset_id: string; figma_node_id: string; dg_id: string | null }> };
    expect(body.identities).toEqual(expect.arrayContaining([
      { asset_id: G1, figma_node_id: '17305:2208', dg_id: 'dg-of-g1/main/v2.json' },
      { asset_id: T1, figma_node_id: '116:21', dg_id: 'dg-of-t1/main/v1.json' },
    ]));
    expect(body.identities.some(i => i.asset_id === X1)).toBe(false);
  });
});

describe('POST /api/projects/split', () => {
  const split = (body: Row) => createApp().request('/api/projects/split', { method: 'POST', headers, body: JSON.stringify(body) });

  it('crée le projet du fichier et y déplace les assets demandés', async () => {
    const res = await split({ figma_file_key: NEW_ID, figma_file_name: 'Gynger', asset_ids: [G1] });
    expect(res.status).toBe(201);
    const body = await res.json() as { api_key: string; project: { id: string; name: string }; assets: Row[] };
    expect(body.project.name).toBe('Gynger');
    expect(body.api_key).toBeTruthy();
    expect(db.tables.assets.find(a => a.id === G1)?.project_id).toBe(body.project.id);
    expect(db.tables.assets.find(a => a.id === T1)?.project_id).toBe('shared'); // non demandé : reste
  });

  it('403 si un asset demandé appartient à un autre projet — rien n\'est créé ni déplacé', async () => {
    const res = await split({ figma_file_key: NEW_ID, figma_file_name: 'Gynger', asset_ids: [G1, X1] });
    expect(res.status).toBe(403);
    expect(db.tables.projects).toHaveLength(2);
    expect(db.tables.assets.find(a => a.id === X1)?.project_id).toBe('other');
    expect(db.tables.assets.find(a => a.id === G1)?.project_id).toBe('shared');
  });

  it('409 si l\'identifiant désigne déjà un projet (pas de prise de contrôle)', async () => {
    const res = await split({ figma_file_key: 'b'.repeat(32), figma_file_name: 'X', asset_ids: [] });
    expect(res.status).toBe(409);
  });

  it('400 si l\'identifiant n\'est pas un id aléatoire de fichier', async () => {
    const res = await split({ figma_file_key: '0:1', figma_file_name: 'X', asset_ids: [] });
    expect(res.status).toBe(400);
  });
});
