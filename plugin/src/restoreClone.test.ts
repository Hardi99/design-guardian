import { describe, it, expect } from 'vitest';
import { pickHistoryClone, framesToPrune, type HistoryFrameInfo } from './restoreClone.js';

const f = (over: Partial<HistoryFrameInfo>): HistoryFrameInfo =>
  ({ id: 'x', versionId: undefined, assetId: 'A', versionNumber: undefined, ...over });

describe('pickHistoryClone', () => {
  it('renvoie l\'id du frame dont versionId correspond', () => {
    const frames = [f({ id: 'c1', versionId: 'v1' }), f({ id: 'c2', versionId: 'v2' })];
    expect(pickHistoryClone(frames, 'v2')).toBe('c2');
  });
  it('undefined si aucun match', () => {
    expect(pickHistoryClone([f({ id: 'c1', versionId: 'v1' })], 'vX')).toBeUndefined();
  });
});

describe('framesToPrune', () => {
  it('garde les N plus récents (vnum décroissant), renvoie les plus vieux à supprimer', () => {
    const frames = [
      f({ id: 'a', assetId: 'A', versionNumber: 1 }),
      f({ id: 'b', assetId: 'A', versionNumber: 2 }),
      f({ id: 'c', assetId: 'A', versionNumber: 3 }),
    ];
    expect(framesToPrune(frames, 'A', 2).sort()).toEqual(['a']); // garde v3,v2 → supprime v1
  });
  it('ne touche pas les autres assets', () => {
    const frames = [
      f({ id: 'a', assetId: 'A', versionNumber: 1 }),
      f({ id: 'z', assetId: 'B', versionNumber: 1 }),
    ];
    expect(framesToPrune(frames, 'A', 5)).toEqual([]); // 1 seul pour A, sous la limite
  });
  it('ignore les frames non finalisées (versionNumber undefined)', () => {
    const frames = [f({ id: 'p', assetId: 'A', versionNumber: undefined }), f({ id: 'a', assetId: 'A', versionNumber: 1 })];
    expect(framesToPrune(frames, 'A', 1)).toEqual([]); // 1 finalisée seulement → rien à élaguer
  });
});
