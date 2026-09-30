import { describe, it, expect } from 'vitest';
import { frameKey, summarizeFrames, framesToRender, MAX_FRAME_RENDERS } from '../services/frames.service.js';
import { enrichDeltaGeometry } from '../services/geometry.service.js';
import type { DeltaJSON, FigmaSnapshot, NodeSnapshot } from '../types/figma.js';

const top = (id: string, dg: string | undefined, name = id): NodeSnapshot => ({
  id, ...(dg ? { dg_id: dg } : {}), name, type: 'FRAME', x: 0, y: 0, width: 100, height: 50,
  opacity: 1, fills: [], strokes: [], children: [],
});
const page = (...frames: NodeSnapshot[]): FigmaSnapshot => ({
  figmaNodeId: 'p', figmaNodeName: 'P', capturedAt: '2026-09-30T00:00:00Z',
  root: { id: 'p', name: 'P', type: 'PAGE', x: 0, y: 0, width: 0, height: 0, opacity: 1, fills: [], strokes: [], children: frames },
});

describe('frameKey', () => {
  it('dg_id si présent (survit au couper-coller), sinon id Figma', () => {
    expect(frameKey(top('1:2', 'DG-A'))).toBe('DG-A');
    expect(frameKey(top('1:2', undefined))).toBe('1:2');
  });
});

describe('summarizeFrames', () => {
  it('v1 (pas de précédente) → toutes initial', () => {
    const out = summarizeFrames(new Map(), page(top('1:1', 'A'), top('1:2', 'B')), null);
    expect(out?.map(f => [f.key, f.status])).toEqual([['A', 'initial'], ['B', 'initial']]);
  });

  it('modified si changements, unchanged sinon — apparié par clé malgré un nouvel id Figma', () => {
    const prev = page(top('1:1', 'A'), top('1:2', 'B'));
    const cur  = page(top('9:9', 'A'), top('1:2', 'B')); // A coupée-collée
    const out = summarizeFrames(new Map([['A', 3]]), cur, prev);
    expect(out).toEqual([
      { key: 'A', id: '9:9', name: '9:9', frame: { w: 100, h: 50 }, status: 'modified', changes: 3 },
      { key: 'B', id: '1:2', name: '1:2', frame: { w: 100, h: 50 }, status: 'unchanged', changes: 0 },
    ]);
  });

  it('frame décochée puis recochée → initial (pas comparée à une version où elle n\'était pas suivie)', () => {
    const out = summarizeFrames(new Map([['B', 2]]), page(top('1:1', 'A'), top('1:2', 'B')), page(top('1:1', 'A')));
    expect(out?.find(f => f.key === 'B')?.status).toBe('initial');
  });

  it('hors page (mode frame) → undefined', () => {
    const frameSnap = { ...page(), root: { ...top('f', 'F'), children: [] } };
    expect(summarizeFrames(new Map(), frameSnap, null)).toBeUndefined();
  });
});

describe('framesToRender', () => {
  const f = (key: string, status: 'initial' | 'modified' | 'unchanged') =>
    ({ key, id: `id-${key}`, name: key, frame: { w: 1, h: 1 }, status, changes: status === 'modified' ? 1 : 0 });

  it('rend les frames initial et modified, jamais unchanged', () => {
    expect(framesToRender([f('A', 'modified'), f('B', 'unchanged'), f('C', 'initial')]))
      .toEqual([{ key: 'A', id: 'id-A' }, { key: 'C', id: 'id-C' }]);
  });

  it('plafonné à MAX_FRAME_RENDERS', () => {
    const many = Array.from({ length: 30 }, (_, i) => f(`K${i}`, 'initial'));
    expect(framesToRender(many)).toHaveLength(MAX_FRAME_RENDERS);
  });
});

describe('enrichDeltaGeometry — clés de frame', () => {
  it('un nœud supprimé d\'une frame coupée-collée est rattaché à la clé de la frame, pas à son ancien id', () => {
    const child = { ...top('1:5', 'N'), width: 10, height: 10 };
    const prev = page({ ...top('1:1', 'A'), children: [child] });
    const cur  = page(top('9:9', 'A'));
    const delta = { modified: [], added: [], removed: [{ nodeId: '1:5', nodeName: 'N', nodeType: 'FRAME', changes: [] }],
      totalChanges: 1, metadata: { v1CapturedAt: '', v2CapturedAt: '', epsilon: 0.01, processingTimeMs: 0 } } as DeltaJSON;
    const out = enrichDeltaGeometry(delta, cur, prev);
    expect(out.removed[0].viewport).toBe('A');
    expect(out.frames).toEqual([{ key: 'A', id: '9:9', name: '9:9', frame: { w: 100, h: 50 }, status: 'modified', changes: 1 }]);
  });
});
