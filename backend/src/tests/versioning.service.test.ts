import { describe, it, expect, vi } from 'vitest';
import { createVersionAtomic } from '../services/versioning.service.js';
import type { FigmaSnapshot } from '../types/figma.js';

const snap = { figmaNodeId: 'n', figmaNodeName: 'N', capturedAt: 't',
  root: { id: 'r', name: 'N', type: 'FRAME', x: 0, y: 0, width: 1, height: 1, opacity: 1, fills: [], strokes: [] },
} as unknown as FigmaSnapshot;

// Storage qui réussit toujours (upload/remove).
const storage = () => ({
  from: () => ({
    upload: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
    download: vi.fn(async () => ({ data: null, error: { message: 'x' } })),
  }),
});

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

describe('createVersionAtomic', () => {
  it('réessaie après une collision 23505 puis réussit', async () => {
    const db = dbWithConflictThenSuccess();
    const res = await createVersionAtomic(db as never, storage() as never, {
      assetId: 'a', branchName: 'main', snapshot: snap,
      author: { figma_id: 'f', name: 'A' },
      computeMeta: async () => ({ analysisJson: null, aiSummary: null }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.version.version_number).toBe(4);
    expect(db._inserts()).toBe(2);
  });
});
