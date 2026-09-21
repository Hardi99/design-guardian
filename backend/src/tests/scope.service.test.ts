import { describe, it, expect } from 'vitest';
import { classifyScopeChanges } from '../services/scope.service.js';
import type { DeltaJSON, FigmaSnapshot } from '../types/figma.js';

const frame = (id: string, name: string, childId: string) => ({
  id, name, type: 'FRAME', x: 0, y: 0, width: 100, height: 100, opacity: 1, fills: [], strokes: [],
  children: [{ id: childId, name: childId, type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10, opacity: 1, fills: [], strokes: [], children: [] }],
});

const page = (frames: ReturnType<typeof frame>[]): FigmaSnapshot => ({
  figmaNodeId: 'page', figmaNodeName: 'P', capturedAt: '2026-01-01T00:00:00Z',
  root: { id: 'page', name: 'P', type: 'PAGE', x: 0, y: 0, width: 0, height: 0, opacity: 1, fills: [], strokes: [], children: frames },
} as unknown as FigmaSnapshot);

const delta = (over: Partial<DeltaJSON>): DeltaJSON => ({
  modified: [], added: [], removed: [], totalChanges: 0,
  metadata: { v1CapturedAt: '', v2CapturedAt: '', epsilon: 0.01, processingTimeMs: 0 },
  ...over,
} as DeltaJSON);

describe('classifyScopeChanges', () => {
  it('une frame nouvellement suivie est scopeIn, pas added — ses nœuds sont purgés', () => {
    const prev = page([frame('a', 'Accueil', 'a1')]);
    const cur  = page([frame('a', 'Accueil', 'a1'), frame('b', 'Panier', 'b1')]);
    const d = delta({ added: [
      { nodeId: 'b',  nodeName: 'Panier', nodeType: 'FRAME', changes: [] },
      { nodeId: 'b1', nodeName: 'b1',     nodeType: 'RECTANGLE', changes: [] },
    ] });
    const out = classifyScopeChanges(d, cur, prev);
    expect(out.scopeIn).toEqual([{ id: 'b', name: 'Panier' }]);
    expect(out.added).toHaveLength(0);
  });

  it('une frame retirée du suivi est scopeOut, pas removed', () => {
    const prev = page([frame('a', 'Accueil', 'a1'), frame('b', 'Panier', 'b1')]);
    const cur  = page([frame('a', 'Accueil', 'a1')]);
    const d = delta({ removed: [
      { nodeId: 'b',  nodeName: 'Panier', nodeType: 'FRAME', changes: [] },
      { nodeId: 'b1', nodeName: 'b1',     nodeType: 'RECTANGLE', changes: [] },
    ] });
    const out = classifyScopeChanges(d, cur, prev);
    expect(out.scopeOut).toEqual([{ id: 'b', name: 'Panier' }]);
    expect(out.removed).toHaveLength(0);
  });

  it('un VRAI ajout dans une frame déjà suivie reste added', () => {
    const prev = page([frame('a', 'Accueil', 'a1')]);
    const cur  = page([frame('a', 'Accueil', 'a1')]);
    const d = delta({ added: [{ nodeId: 'a2', nodeName: 'Nouveau', nodeType: 'RECTANGLE', changes: [] }] });
    const out = classifyScopeChanges(d, cur, prev);
    expect(out.added.map(n => n.nodeId)).toEqual(['a2']);
    expect(out.scopeIn ?? []).toHaveLength(0);
  });

  it('mode frame (racine non-PAGE) : delta rendu tel quel', () => {
    const frameSnap = { root: { id: 'f', name: 'F', type: 'FRAME', children: [] } } as unknown as FigmaSnapshot;
    const d = delta({ added: [{ nodeId: 'x', nodeName: 'X', nodeType: 'RECTANGLE', changes: [] }] });
    const out = classifyScopeChanges(d, frameSnap, frameSnap);
    expect(out.added).toHaveLength(1);
    expect(out.scopeIn).toBeUndefined();
  });

  it('pas de snapshot précédent (v1) : delta rendu tel quel', () => {
    const cur = page([frame('a', 'Accueil', 'a1')]);
    const d = delta({ added: [{ nodeId: 'a1', nodeName: 'a1', nodeType: 'RECTANGLE', changes: [] }] });
    const out = classifyScopeChanges(d, cur, null);
    expect(out.added).toHaveLength(1);
    expect(out.scopeIn).toBeUndefined();
  });
});
