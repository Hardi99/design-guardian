import { describe, it, expect } from 'vitest';
import { nodeBboxRelative, enrichDeltaGeometry } from '../services/geometry.service.js';
import type { FigmaSnapshot, DeltaJSON } from '../types/figma.js';

const snap = (): FigmaSnapshot => ({
  root: { id: 'root', name: 'F', type: 'FRAME', x: 100, y: 50, width: 200, height: 100,
    opacity: 1, fills: [], strokes: [],
    children: [{ id: 'a', name: 'A', type: 'RECT', x: 120, y: 70, width: 40, height: 20, opacity: 1, fills: [], strokes: [], children: [] }] },
} as unknown as FigmaSnapshot);

describe('nodeBboxRelative', () => {
  it('renvoie la bbox relative à la root', () => {
    expect(nodeBboxRelative(snap(), 'a')).toEqual({ x: 20, y: 20, w: 40, h: 20 });
  });
  it('null si nœud absent', () => {
    expect(nodeBboxRelative(snap(), 'zzz')).toBeNull();
  });
});

describe('enrichDeltaGeometry', () => {
  it('ajoute frame + bbox aux modified', () => {
    const delta = { modified: [{ nodeId: 'a', nodeName: 'A', nodeType: 'RECT', changes: [] }], added: [], removed: [], totalChanges: 1, metadata: {} } as unknown as DeltaJSON;
    const out = enrichDeltaGeometry(delta, snap(), null);
    expect(out.frame).toEqual({ w: 200, h: 100 });
    expect(out.modified[0].bbox).toEqual({ x: 20, y: 20, w: 40, h: 20 });
  });

  // Snapshot avec une icône (INSTANCE) 'icon' [x=120,y=70,40×20] contenant un vecteur 'v'.
  const snapWithIcon = (): FigmaSnapshot => ({
    root: { id: 'root', name: 'F', type: 'FRAME', x: 100, y: 50, width: 200, height: 100,
      opacity: 1, fills: [], strokes: [],
      children: [{ id: 'icon', name: 'icon/wifi', type: 'INSTANCE', x: 120, y: 70, width: 40, height: 20, opacity: 1, fills: [], strokes: [],
        children: [{ id: 'v', name: 'Vector', type: 'VECTOR', x: 124, y: 74, width: 10, height: 10, opacity: 1, fills: [], strokes: [], children: [] }] }] },
  } as unknown as FigmaSnapshot);

  it('attache instanceRoot/instanceName/instanceBbox (bbox de l\'icône) au nœud interne d\'une INSTANCE', () => {
    const delta = { modified: [{ nodeId: 'v', nodeName: 'Vector', nodeType: 'VECTOR', changes: [] }], added: [], removed: [], totalChanges: 1, metadata: {} } as unknown as DeltaJSON;
    const out = enrichDeltaGeometry(delta, snapWithIcon(), null);
    expect(out.modified[0].instanceRoot).toBe('icon');
    expect(out.modified[0].instanceName).toBe('icon/wifi');
    // La boîte du groupe = celle de l'icône entière, pas celle du vecteur interne.
    expect(out.modified[0].instanceBbox).toEqual({ x: 20, y: 20, w: 40, h: 20 });
    expect(out.modified[0].bbox).toEqual({ x: 24, y: 24, w: 10, h: 10 });
  });

  it('laisse instanceRoot absent pour un nœud hors instance', () => {
    const delta = { modified: [{ nodeId: 'a', nodeName: 'A', nodeType: 'RECT', changes: [] }], added: [], removed: [], totalChanges: 1, metadata: {} } as unknown as DeltaJSON;
    const out = enrichDeltaGeometry(delta, snap(), null);
    expect(out.modified[0].instanceRoot).toBeUndefined();
    expect(out.modified[0].instanceBbox).toBeUndefined();
  });
});
