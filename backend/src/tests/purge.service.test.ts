import { describe, it, expect, vi } from 'vitest';
import { collectProjectStoragePaths, purgeProjectData, purgeAccount } from '../services/purge.service.js';

// Storage stub : 1 asset 'a1' → branche 'main' → v1.json + v1_render.json
function storageStub() {
  const remove = vi.fn(async () => ({ error: null }));
  const list = vi.fn(async (path: string) => {
    if (path === 'a1') return { data: [{ name: 'main' }], error: null };
    if (path === 'a1/main') return { data: [{ name: 'v1.json' }, { name: 'v1_render.json' }], error: null };
    return { data: [], error: null };
  });
  return { storage: { from: () => ({ list, remove }) }, remove };
}

// DB stub paramétrable.
function dbStub(opts: { assets?: { id: string }[]; projects?: { id: string }[]; sub?: string | null }) {
  const deleteEq = vi.fn(async () => ({ error: null }));
  const deleteUser = vi.fn(async () => ({ error: null }));
  const from = (table: string) => {
    if (table === 'assets') return { select: () => ({ eq: async () => ({ data: opts.assets ?? [], error: null }) }) };
    if (table === 'projects') return {
      select: () => ({ eq: async () => ({ data: opts.projects ?? [], error: null }) }),
      delete: () => ({ eq: deleteEq }),
    };
    if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stripe_subscription_id: opts.sub ?? null }, error: null }) }) }) };
    return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
  };
  return { db: { from, auth: { admin: { deleteUser } } }, deleteEq, deleteUser };
}

describe('collectProjectStoragePaths', () => {
  it('énumère les blobs sur 2 niveaux', async () => {
    const { storage } = storageStub();
    const { db } = dbStub({ assets: [{ id: 'a1' }] });
    const paths = await collectProjectStoragePaths(db as never, storage as never, 'p1');
    expect(paths).toEqual(['a1/main/v1.json', 'a1/main/v1_render.json']);
  });
});

describe('purgeProjectData', () => {
  it('supprime les blobs PUIS la ligne projet', async () => {
    const { storage, remove } = storageStub();
    const { db, deleteEq } = dbStub({ assets: [{ id: 'a1' }] });
    const res = await purgeProjectData(db as never, storage as never, 'p1');
    expect(remove).toHaveBeenCalledWith(['a1/main/v1.json', 'a1/main/v1_render.json']);
    expect(deleteEq).toHaveBeenCalled();
    expect(res).toEqual({ blobs: 2 });
  });
});

describe('purgeAccount', () => {
  it('annule Stripe, purge le Storage, supprime l\'utilisateur', async () => {
    const { storage } = storageStub();
    const { db, deleteUser } = dbStub({ projects: [{ id: 'p1' }], assets: [{ id: 'a1' }], sub: 'sub_123' });
    const cancel = vi.fn(async () => ({}));
    const stripe = { subscriptions: { cancel } };
    const res = await purgeAccount(db as never, storage as never, stripe as never, 'u1');
    expect(cancel).toHaveBeenCalledWith('sub_123');
    expect(deleteUser).toHaveBeenCalledWith('u1');
    expect(res).toEqual({ projects: 1, blobs: 2 });
  });

  it('sans abonnement : ne tente pas d\'annulation', async () => {
    const { storage } = storageStub();
    const { db, deleteUser } = dbStub({ projects: [{ id: 'p1' }], assets: [{ id: 'a1' }], sub: null });
    const cancel = vi.fn(async () => ({}));
    await purgeAccount(db as never, storage as never, { subscriptions: { cancel } } as never, 'u1');
    expect(cancel).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });
});
