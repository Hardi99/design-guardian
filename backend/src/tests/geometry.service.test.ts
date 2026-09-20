import { describe, it, expect } from 'vitest';
import { nodeBboxRelative, nodeBboxIn, enrichDeltaGeometry } from '../services/geometry.service.js';
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

  // ─── Page-centric : viewport ───────────────────────────────────────────────
  // Page (type PAGE) → Accueil [120,70, 40×20] → Logo [124,74, 10×10]
  const snapPage = (): FigmaSnapshot => ({
    root: { id: 'page', name: 'Écrans', type: 'PAGE', x: 0, y: 0, width: 0, height: 0,
      opacity: 1, fills: [], strokes: [],
      children: [{ id: 'accueil', name: 'Accueil', type: 'FRAME', x: 120, y: 70, width: 40, height: 20,
        opacity: 1, fills: [], strokes: [],
        children: [{ id: 'logo', name: 'Logo', type: 'VECTOR', x: 124, y: 74, width: 10, height: 10,
          opacity: 1, fills: [], strokes: [], children: [] }] }] },
  } as unknown as FigmaSnapshot);

  const deltaOf = (ids: string[]): DeltaJSON => ({
    modified: ids.map(id => ({ nodeId: id, nodeName: id, nodeType: 'VECTOR', changes: [] })),
    added: [], removed: [], totalChanges: ids.length, metadata: {},
  } as unknown as DeltaJSON);

  it('attache le viewport et rend la bbox relative à CE viewport', () => {
    const out = enrichDeltaGeometry(deltaOf(['logo']), snapPage(), null);
    expect(out.modified[0].viewport).toBe('accueil');
    expect(out.modified[0].bbox).toEqual({ x: 4, y: 4, w: 10, h: 10 }); // et non {24,24}
  });

  it('expose viewports[] avec nom, cadre et compte de changements', () => {
    const out = enrichDeltaGeometry(deltaOf(['logo', 'accueil']), snapPage(), null);
    expect(out.viewports).toEqual([{ id: 'accueil', name: 'Accueil', frame: { w: 40, h: 20 }, changes: 2 }]);
  });

  it('compte les GROUPES : deux nœuds d\'une même icône comptent pour 1', () => {
    const d = deltaOf(['logo']);
    d.modified.push({ nodeId: 'logo2', nodeName: 'l2', nodeType: 'VECTOR', changes: [] });
    d.modified[0].instanceRoot = 'icon1';
    d.modified[1].instanceRoot = 'icon1';
    const out = enrichDeltaGeometry(d, snapPage(), null);
    expect(out.viewports?.[0].changes).toBe(1);
  });

  it('mode frame (racine non-PAGE) : aucun viewport, bbox relative à la racine', () => {
    const out = enrichDeltaGeometry(deltaOf(['a']), snap(), null);
    expect(out.modified[0].viewport).toBeUndefined();
    expect(out.viewports).toBeUndefined();
    expect(out.modified[0].bbox).toEqual({ x: 20, y: 20, w: 40, h: 20 });
  });
});

describe('nodeBboxIn', () => {
  const s = (): FigmaSnapshot => ({
    root: { id: 'root', name: 'P', type: 'PAGE', x: 100, y: 50, width: 0, height: 0,
      opacity: 1, fills: [], strokes: [],
      children: [{ id: 'accueil', name: 'Accueil', type: 'FRAME', x: 120, y: 70, width: 40, height: 20,
        opacity: 1, fills: [], strokes: [],
        children: [{ id: 'logo', name: 'Logo', type: 'VECTOR', x: 124, y: 74, width: 10, height: 10,
          opacity: 1, fills: [], strokes: [], children: [] }] }] },
  } as unknown as FigmaSnapshot);

  it('bbox d\'un descendant relative à son viewport', () => {
    expect(nodeBboxIn(s(), 'logo', 'accueil')).toEqual({ x: 4, y: 4, w: 10, h: 10 });
  });

  it('un viewport relatif à lui-même est en {0,0}', () => {
    expect(nodeBboxIn(s(), 'accueil', 'accueil')).toEqual({ x: 0, y: 0, w: 40, h: 20 });
  });

  it('null si le nœud ou l\'origine est introuvable', () => {
    expect(nodeBboxIn(s(), 'zzz', 'accueil')).toBeNull();
    expect(nodeBboxIn(s(), 'logo', 'zzz')).toBeNull();
  });
});
