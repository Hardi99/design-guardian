import { describe, it, expect, vi } from 'vitest';
import { createVersionAtomic } from '../services/versioning.service.js';
import type { FigmaSnapshot } from '../types/figma.js';

const snap = { figmaNodeId: 'n', figmaNodeName: 'N', capturedAt: 't',
  root: { id: 'r', name: 'N', type: 'FRAME', x: 0, y: 0, width: 1, height: 1, opacity: 1, fills: [], strokes: [] },
} as unknown as FigmaSnapshot;

// Storage à bucket partagé : un seul jeu de spies, observable depuis le test
// (un nouvel objet par .from() rendrait `remove` inatteignable pour les assertions).
function storageWithSpies() {
  const bucket = {
    upload: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
    download: vi.fn(async () => ({ data: null, error: { message: 'x' } })),
  };
  return { storage: { from: () => bucket }, bucket };
}

// DB scénarisée : prev = v2 ; 1er insert → 23505 ; 2e insert → succès en v4.
function dbWithConflictThenSuccess() {
  let inserts = 0;
  const prev = { id: 'p', version_number: 2, storage_path: null };
  return {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: prev, error: null }) }) }) }) }) }),
      insert: () => ({ select: () => ({ single: async () => {
        inserts++;
        if (inserts === 1) return { data: null, error: { message: 'dup', code: '23505' } };
        return { data: { id: 'v', version_number: 4, branch_name: 'main' }, error: null };
      } }) }),
    }),
    _inserts: () => inserts,
  };
}

// Helper: DB qui réussit au premier essai (pas de conflit 23505).
function dbFirstSuccess() {
  const prev = { id: 'p', version_number: 1, storage_path: null };
  return {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: prev, error: null }) }) }) }) }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'v', version_number: 2, branch_name: 'main' }, error: null }) }) }),
    }),
  };
}

describe('createVersionAtomic', () => {
  it('stocke le render PNG en blob binaire _render.png avec contentType image/png', async () => {
    const db = dbFirstSuccess();
    let capturedPath: string | undefined;
    let capturedData: Buffer | undefined;
    let capturedContentType: string | undefined;
    const bucket = {
      upload: vi.fn(async (path: string, data: Uint8Array, opts?: { contentType?: string; upsert?: boolean }) => {
        if (path.includes('_render')) {
          capturedPath = path;
          capturedData = Buffer.from(data);
          capturedContentType = opts?.contentType;
        }
        return { error: null as null };
      }),
      remove: vi.fn(async () => ({ error: null as null })),
      download: vi.fn(async () => ({ data: null as null, error: { message: 'x' } })),
    };
    const storage = { from: () => bucket };
    const res = await createVersionAtomic(db as never, storage as never, {
      assetId: 'a', branchName: 'main', snapshot: snap,
      renderB64: 'iVBOxxx', renderKind: 'png',
      author: { figma_id: 'f', name: 'A' },
      computeMeta: async () => ({ analysisJson: null, aiSummary: null }),
    });
    expect(res.ok).toBe(true);
    expect(capturedPath).toMatch(/_render\.png$/);
    expect(capturedContentType).toBe('image/png');
    expect(capturedData).toEqual(Buffer.from('iVBOxxx', 'base64'));
  });

  it('stocke le render SVG en blob binaire _render.svg avec contentType image/svg+xml', async () => {
    const db = dbFirstSuccess();
    let capturedPath: string | undefined;
    let capturedData: Buffer | undefined;
    let capturedContentType: string | undefined;
    const bucket = {
      upload: vi.fn(async (path: string, data: Uint8Array, opts?: { contentType?: string; upsert?: boolean }) => {
        if (path.includes('_render')) {
          capturedPath = path;
          capturedData = Buffer.from(data);
          capturedContentType = opts?.contentType;
        }
        return { error: null as null };
      }),
      remove: vi.fn(async () => ({ error: null as null })),
      download: vi.fn(async () => ({ data: null as null, error: { message: 'x' } })),
    };
    const storage = { from: () => bucket };
    const res = await createVersionAtomic(db as never, storage as never, {
      assetId: 'a', branchName: 'main', snapshot: snap,
      renderB64: 'PHN2Zy8+', renderKind: 'svg',
      author: { figma_id: 'f', name: 'A' },
      computeMeta: async () => ({ analysisJson: null, aiSummary: null }),
    });
    expect(res.ok).toBe(true);
    expect(capturedPath).toMatch(/_render\.svg$/);
    expect(capturedContentType).toBe('image/svg+xml');
    expect(capturedData).toEqual(Buffer.from('PHN2Zy8+', 'base64'));
  });

  it('réessaie après une collision 23505 puis réussit, en nettoyant le snapshot orphelin', async () => {
    const db = dbWithConflictThenSuccess();
    const { storage, bucket } = storageWithSpies();
    const res = await createVersionAtomic(db as never, storage as never, {
      assetId: 'a', branchName: 'main', snapshot: snap,
      author: { figma_id: 'f', name: 'A' },
      computeMeta: async () => ({ analysisJson: null, aiSummary: null }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.version.version_number).toBe(4);
    expect(db._inserts()).toBe(2);
    // Après l'insert en conflit (23505), le blob orphelin + son rendu sont supprimés.
    expect(bucket.remove).toHaveBeenCalledWith(['a/main/v3.json', 'a/main/v3_render.svg']);
  });

  it('nettoie le snapshot orphelin si computeMeta lève (et renvoie 500 sans retenter)', async () => {
    const db = dbWithConflictThenSuccess();
    const { storage, bucket } = storageWithSpies();
    const res = await createVersionAtomic(db as never, storage as never, {
      assetId: 'a', branchName: 'main', snapshot: snap,
      author: { figma_id: 'f', name: 'A' },
      computeMeta: async () => { throw new Error('diff boom'); },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
    expect(db._inserts()).toBe(0); // pas d'insert tenté
    expect(bucket.remove).toHaveBeenCalledWith(['a/main/v3.json', 'a/main/v3_render.svg']);
  });
});
