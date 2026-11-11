import { describe, it, expect } from 'vitest';
import {
  hashSnapshot, latestCopy, pickHistoryClone, framesToPrune, planPageRestore, restoreSummary, stalePending,
  type HistoryFrameInfo,
} from './restoreClone.js';

const f = (over: Partial<HistoryFrameInfo>): HistoryFrameInfo =>
  ({ id: 'x', key: 'A', versionIds: [], versionNumber: undefined, hash: undefined, gold: [], pending: false, ...over });

describe('hashSnapshot', () => {
  it('même contenu → même empreinte ; un pixel de différence → autre empreinte', () => {
    expect(hashSnapshot({ x: 1, fills: ['#fff'] })).toBe(hashSnapshot({ x: 1, fills: ['#fff'] }));
    expect(hashSnapshot({ x: 1 })).not.toBe(hashSnapshot({ x: 1.01 }));
  });
});

describe('latestCopy — à quoi comparer la frame à la capture', () => {
  it('la copie validée la plus récente de CETTE frame (les copies en attente ne comptent pas)', () => {
    const frames = [
      f({ id: 'old', versionNumber: 1 }), f({ id: 'new', versionNumber: 4 }),
      f({ id: 'autre', key: 'B', versionNumber: 9 }), f({ id: 'attente' }),
    ];
    expect(latestCopy(frames, 'A')?.id).toBe('new');
  });
  it('aucune copie → undefined (la frame sera copiée)', () => {
    expect(latestCopy([], 'A')).toBeUndefined();
  });
});

describe('pickHistoryClone — copie qui couvre une version', () => {
  it('une copie couvre toutes les versions où la frame n’a pas changé', () => {
    const frames = [f({ id: 'c1', versionIds: ['v1', 'v2', 'v3'], versionNumber: 1 }), f({ id: 'c4', versionIds: ['v4'], versionNumber: 4 })];
    expect(pickHistoryClone(frames, 'v2')).toBe('c1');
    expect(pickHistoryClone(frames, 'vX')).toBeUndefined();
  });
  it('limitée à une frame quand on donne sa clé', () => {
    const frames = [f({ id: 'a', key: 'A', versionIds: ['v1'] }), f({ id: 'b', key: 'B', versionIds: ['v1'] })];
    expect(pickHistoryClone(frames, 'v1', 'B')).toBe('b');
  });
});

describe('framesToPrune — 5 copies max par frame, Gold jamais supprimé', () => {
  const copies = (n: number, key = 'A') => Array.from({ length: n }, (_, i) => f({ id: `${key}${i + 1}`, key, versionNumber: i + 1 }));
  it('supprime les plus anciennes au-delà de la limite', () => {
    expect(framesToPrune(copies(7), 'A', 5).sort()).toEqual(['A1', 'A2']);
  });
  it('une copie qui couvre une version Gold est gardée, même ancienne', () => {
    const frames = copies(7); frames[0] = { ...frames[0], gold: ['v1'] };
    expect(framesToPrune(frames, 'A', 5)).toEqual(['A2']);
  });
  it('ne touche ni aux autres frames, ni aux copies en attente', () => {
    expect(framesToPrune([...copies(5), ...copies(3, 'B'), f({ id: 'attente' })], 'A', 5)).toEqual([]);
  });
});

describe('planPageRestore — que faire de chaque frame de la version', () => {
  const copiesV2 = [f({ id: 'cA', key: 'A', versionIds: ['v2'], versionNumber: 2 })];
  it('copie disponible → restauration à l’identique (frame présente ou supprimée depuis)', () => {
    const live = new Map([['A', 'liveA']]);
    expect(planPageRestore([{ id: '1:1', dg_id: 'A' }], copiesV2, 'v2', live))
      .toEqual([{ kind: 'copy', copyId: 'cA', live: 'liveA', snap: { id: '1:1', dg_id: 'A' } }]);
    expect(planPageRestore([{ id: '1:1', dg_id: 'A' }], copiesV2, 'v2', new Map()))
      .toEqual([{ kind: 'copy', copyId: 'cA', live: undefined, snap: { id: '1:1', dg_id: 'A' } }]);
  });
  it('pas de copie mais frame présente → secours (on réapplique les valeurs)', () => {
    expect(planPageRestore([{ id: '9:9' }], copiesV2, 'v2', new Map([['9:9', 'live9']])))
      .toEqual([{ kind: 'reapply', live: 'live9', snap: { id: '9:9' } }]);
  });
  it('ni copie ni frame → introuvable', () => {
    expect(planPageRestore([{ id: '9:9' }], [], 'v2', new Map())).toEqual([{ kind: 'missing', snap: { id: '9:9' } }]);
  });
});

describe('restoreSummary — message au designer', () => {
  it('dit honnêtement ce qui est exact, partiel ou introuvable', () => {
    expect(restoreSummary({ exact: 2, partial: 0, missing: 0 })).toBe('✓ 2 frames restaurées à l’identique');
    expect(restoreSummary({ exact: 1, partial: 1, missing: 1 }))
      .toBe('✓ 1 frame restaurée à l’identique · 1 partiellement (copie trop ancienne) · 1 introuvable');
  });
  it('sans aucune copie : pas de « 0 frame restaurée à l’identique »', () => {
    expect(restoreSummary({ exact: 0, partial: 2, missing: 0 })).toBe('✓ 2 frames restaurées partiellement (copie trop ancienne)');
  });
});

describe('stalePending — copies en attente abandonnées (captures simultanées)', () => {
  const H = 3_600_000, now = 10 * H;
  it("garde la capture d'un collègue encore en route, supprime celles de plus d'une heure", () => {
    const frames = [f({ id: 'lea', pending: true, pendingAt: now - 2_000 }), f({ id: 'oubliee', pending: true, pendingAt: now - 2 * H })];
    expect(stalePending(frames, now, H)).toEqual(['oubliee']);
  });
  it("une copie en attente sans heure (ancienne version du plugin) est abandonnée", () => {
    expect(stalePending([f({ id: 'vieille', pending: true })], now, H)).toEqual(['vieille']);
  });
  it('ne touche jamais aux copies validées', () => {
    expect(stalePending([f({ id: 'ok', versionNumber: 1, versionIds: ['v1'] })], now, H)).toEqual([]);
  });
});
