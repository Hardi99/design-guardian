import { describe, it, expect } from 'vitest';
import { DiffService } from './diff.service.js';
import type { FigmaSnapshot, NodeSnapshot } from '../types/figma.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRoot(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return {
    id: 'node-1',
    name: 'Test Node',
    type: 'RECTANGLE',
    x: 0, y: 0, width: 100, height: 100,
    opacity: 1,
    fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } }],
    strokes: [],
    ...overrides,
  };
}

function makeSnapshot(rootOverrides: Partial<NodeSnapshot> = {}): FigmaSnapshot {
  return {
    figmaNodeId: 'node-1',
    figmaNodeName: 'Test Node',
    capturedAt: new Date().toISOString(),
    root: makeRoot(rootOverrides),
  };
}

const svc = new DiffService();

// ─── Basic (no change) ────────────────────────────────────────────────────────

describe('DiffService – no changes', () => {
  it('returns zero changes for identical snapshots', () => {
    const s = makeSnapshot();
    const result = svc.compareSnapshots(s, s);
    expect(result.totalChanges).toBe(0);
    expect(result.modified).toHaveLength(0);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('includes correct metadata', () => {
    const s = makeSnapshot();
    const result = svc.compareSnapshots(s, s);
    expect(result.metadata.epsilon).toBe(0.01);
    expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.v1CapturedAt).toBe(s.capturedAt);
    expect(result.metadata.v2CapturedAt).toBe(s.capturedAt);
  });
});

// ─── Geometry ─────────────────────────────────────────────────────────────────

describe('DiffService – geometry changes', () => {
  it('detects x position change above epsilon', () => {
    const v1 = makeSnapshot({ x: 10 });
    const v2 = makeSnapshot({ x: 12.5 });
    const result = svc.compareSnapshots(v1, v2);
    const xChange = result.modified[0]?.changes.find(c => c.property === 'x');
    expect(xChange).toBeDefined();
    expect(xChange?.delta).toBe('+2.50px');
    expect(xChange?.oldValue).toBe(10);
    expect(xChange?.newValue).toBe(12.5);
  });

  it('detects y position change', () => {
    const v1 = makeSnapshot({ y: 0 });
    const v2 = makeSnapshot({ y: -5 });
    const result = svc.compareSnapshots(v1, v2);
    const yChange = result.modified[0]?.changes.find(c => c.property === 'y');
    expect(yChange).toBeDefined();
    expect(yChange?.delta).toBe('-5.00px');
  });

  it('detects width resize', () => {
    const v1 = makeSnapshot({ width: 100 });
    const v2 = makeSnapshot({ width: 200 });
    const result = svc.compareSnapshots(v1, v2);
    const wChange = result.modified[0]?.changes.find(c => c.property === 'width');
    expect(wChange).toBeDefined();
    expect(wChange?.delta).toBe('+100.00px');
  });

  it('detects height resize', () => {
    const v1 = makeSnapshot({ height: 50 });
    const v2 = makeSnapshot({ height: 80 });
    const result = svc.compareSnapshots(v1, v2);
    const hChange = result.modified[0]?.changes.find(c => c.property === 'height');
    expect(hChange).toBeDefined();
    expect(hChange?.delta).toBe('+30.00px');
  });

  it('ignores changes at or below epsilon (0.01px)', () => {
    const v1 = makeSnapshot({ x: 10 });
    const v2 = makeSnapshot({ x: 10.005 });
    const result = svc.compareSnapshots(v1, v2);
    expect(result.totalChanges).toBe(0);
  });

  it('detects change exactly above epsilon', () => {
    const v1 = makeSnapshot({ x: 0 });
    const v2 = makeSnapshot({ x: 0.011 });
    const result = svc.compareSnapshots(v1, v2);
    const xChange = result.modified[0]?.changes.find(c => c.property === 'x');
    expect(xChange).toBeDefined();
  });
});

// ─── Visual properties ────────────────────────────────────────────────────────

describe('DiffService – visual property changes', () => {
  it('detects opacity change', () => {
    const v1 = makeSnapshot({ opacity: 1 });
    const v2 = makeSnapshot({ opacity: 0.5 });
    const result = svc.compareSnapshots(v1, v2);
    const opChange = result.modified[0]?.changes.find(c => c.property === 'opacity');
    expect(opChange).toBeDefined();
    expect(opChange?.delta).toBe('100% -> 50%');
  });

  it('ignores negligible opacity difference', () => {
    const v1 = makeSnapshot({ opacity: 1 });
    const v2 = makeSnapshot({ opacity: 1.0005 });
    const result = svc.compareSnapshots(v1, v2);
    const opChange = result.modified[0]?.changes.find(c => c.property === 'opacity');
    expect(opChange).toBeUndefined();
  });

  it('detects cornerRadius change', () => {
    const v1 = makeSnapshot({ cornerRadius: 4 });
    const v2 = makeSnapshot({ cornerRadius: 12 });
    const result = svc.compareSnapshots(v1, v2);
    const crChange = result.modified[0]?.changes.find(c => c.property === 'cornerRadius');
    expect(crChange).toBeDefined();
    expect(crChange?.delta).toBe('+8.00px');
  });

  it('ignores cornerRadius when only one side has it defined', () => {
    // If v1 has no cornerRadius and v2 adds one, the service only compares when BOTH are defined
    const v1 = makeSnapshot({});
    const v2 = makeSnapshot({ cornerRadius: 8 });
    const result = svc.compareSnapshots(v1, v2);
    const crChange = result.modified[0]?.changes.find(c => c.property === 'cornerRadius');
    expect(crChange).toBeUndefined();
  });

  it('detects strokeWeight change', () => {
    const v1 = makeSnapshot({ strokeWeight: 1 });
    const v2 = makeSnapshot({ strokeWeight: 3 });
    const result = svc.compareSnapshots(v1, v2);
    const swChange = result.modified[0]?.changes.find(c => c.property === 'strokeWeight');
    expect(swChange).toBeDefined();
    expect(swChange?.delta).toBe('+2.00px');
  });
});

// ─── Fill changes ─────────────────────────────────────────────────────────────

describe('DiffService – fill changes', () => {
  it('detects solid fill color change', () => {
    const v1 = makeSnapshot({ fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } }] });
    const v2 = makeSnapshot({ fills: [{ type: 'SOLID', color: { r: 0.33, g: 0.33, b: 0.33, a: 1 } }] });
    const result = svc.compareSnapshots(v1, v2);
    const fillChange = result.modified[0]?.changes.find(c => c.property === 'fill');
    expect(fillChange).toBeDefined();
    expect(fillChange?.oldValue).toBe('#CCCCCC');
    expect(fillChange?.newValue).toBe('#545454');
  });

  it('detects fill color change with alpha', () => {
    const v1 = makeSnapshot({ fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 0.5 } }] });
    const v2 = makeSnapshot({ fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 0.5 } }] });
    const result = svc.compareSnapshots(v1, v2);
    const fillChange = result.modified[0]?.changes.find(c => c.property === 'fill');
    expect(fillChange).toBeDefined();
    // Alpha < 1 → appended as hex in colorToHex
    expect((fillChange?.oldValue as string).startsWith('#FF0000')).toBe(true);
    expect((fillChange?.newValue as string).startsWith('#0000FF')).toBe(true);
  });

  it('does not report fill change for identical colors', () => {
    const color = { r: 0.5, g: 0.25, b: 0.75, a: 1 };
    const v1 = makeSnapshot({ fills: [{ type: 'SOLID', color }] });
    const v2 = makeSnapshot({ fills: [{ type: 'SOLID', color: { ...color } }] });
    const result = svc.compareSnapshots(v1, v2);
    const fillChange = result.modified[0]?.changes.find(c => c.property === 'fill');
    expect(fillChange).toBeUndefined();
  });

  it('detects fill count change (fill added)', () => {
    const v1 = makeSnapshot({ fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] });
    const v2 = makeSnapshot({
      fills: [
        { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } },
        { type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 } },
      ],
    });
    const result = svc.compareSnapshots(v1, v2);
    const fillsChange = result.modified[0]?.changes.find(c => c.property === 'fills');
    expect(fillsChange).toBeDefined();
    expect(fillsChange?.oldValue).toBe('1 fill(s)');
    expect(fillsChange?.newValue).toBe('2 fill(s)');
  });

  it('detects fill count change (fill removed)', () => {
    const v1 = makeSnapshot({ fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }, { type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 } }] });
    const v2 = makeSnapshot({ fills: [] });
    const result = svc.compareSnapshots(v1, v2);
    const fillsChange = result.modified[0]?.changes.find(c => c.property === 'fills');
    expect(fillsChange).toBeDefined();
    expect(fillsChange?.oldValue).toBe('2 fill(s)');
    expect(fillsChange?.newValue).toBe('0 fill(s)');
  });
});

// ─── Stroke changes ───────────────────────────────────────────────────────────

describe('DiffService – stroke changes', () => {
  it('detects stroke color change', () => {
    const v1 = makeSnapshot({ strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }] });
    const v2 = makeSnapshot({ strokes: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] });
    const result = svc.compareSnapshots(v1, v2);
    const strokeChange = result.modified[0]?.changes.find(c => c.property === 'stroke');
    expect(strokeChange).toBeDefined();
    expect(strokeChange?.oldValue).toBe('#000000');
    expect(strokeChange?.newValue).toBe('#FF0000');
  });

  it('does not report stroke change when both have no stroke', () => {
    const v1 = makeSnapshot({ strokes: [] });
    const v2 = makeSnapshot({ strokes: [] });
    const result = svc.compareSnapshots(v1, v2);
    const strokeChange = result.modified[0]?.changes.find(c => c.property === 'stroke');
    expect(strokeChange).toBeUndefined();
  });
});

// ─── Vector paths ─────────────────────────────────────────────────────────────

describe('DiffService – vector path changes', () => {
  it('detects vector path geometry change', () => {
    const v1 = makeSnapshot({
      type: 'VECTOR',
      vectorPaths: [{ windingRule: 'NONZERO', data: 'M 0 0 L 100 0 L 50 100 Z' }],
    });
    const v2 = makeSnapshot({
      type: 'VECTOR',
      vectorPaths: [{ windingRule: 'NONZERO', data: 'M 0 0 L 100 0 L 60 80 Z' }],
    });
    const result = svc.compareSnapshots(v1, v2);
    const vpChange = result.modified[0]?.changes.find(c => c.property === 'vectorPaths');
    expect(vpChange).toBeDefined();
    expect(vpChange?.delta).toBe('Path geometry modified');
  });

  it('does not report vector path change for identical paths', () => {
    const paths = [{ windingRule: 'NONZERO' as const, data: 'M 0 0 L 100 100 Z' }];
    const v1 = makeSnapshot({ type: 'VECTOR', vectorPaths: paths });
    const v2 = makeSnapshot({ type: 'VECTOR', vectorPaths: [...paths] });
    const result = svc.compareSnapshots(v1, v2);
    const vpChange = result.modified[0]?.changes.find(c => c.property === 'vectorPaths');
    expect(vpChange).toBeUndefined();
  });

  it('does not report vector path when both nodes have no paths', () => {
    const v1 = makeSnapshot({});
    const v2 = makeSnapshot({});
    const result = svc.compareSnapshots(v1, v2);
    const vpChange = result.modified[0]?.changes.find(c => c.property === 'vectorPaths');
    expect(vpChange).toBeUndefined();
  });
});

// ─── Structural changes (add/remove nodes) ────────────────────────────────────

describe('DiffService – structural changes', () => {
  function makeFrame(children: NodeSnapshot[] = []): FigmaSnapshot {
    return {
      figmaNodeId: 'root',
      figmaNodeName: 'Frame',
      capturedAt: new Date().toISOString(),
      root: {
        id: 'root', name: 'Frame', type: 'FRAME',
        x: 0, y: 0, width: 200, height: 200,
        opacity: 1, fills: [], strokes: [],
        children,
      },
    };
  }

  const childNode: NodeSnapshot = {
    id: 'child-1', name: 'Circle', type: 'ELLIPSE',
    x: 50, y: 50, width: 40, height: 40,
    opacity: 1, fills: [], strokes: [],
  };

  it('detects added node', () => {
    const v1 = makeFrame([]);
    const v2 = makeFrame([childNode]);
    const result = svc.compareSnapshots(v1, v2);
    expect(result.added).toHaveLength(1);
    expect(result.added[0]?.nodeName).toBe('Circle');
    expect(result.added[0]?.nodeType).toBe('ELLIPSE');
    expect(result.totalChanges).toBe(1);
  });

  it('detects removed node', () => {
    const v1 = makeFrame([childNode]);
    const v2 = makeFrame([]);
    const result = svc.compareSnapshots(v1, v2);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]?.nodeName).toBe('Circle');
    expect(result.totalChanges).toBe(1);
  });

  it('detects both added and removed in same operation', () => {
    const nodeA: NodeSnapshot = { id: 'a', name: 'A', type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10, opacity: 1, fills: [], strokes: [] };
    const nodeB: NodeSnapshot = { id: 'b', name: 'B', type: 'ELLIPSE', x: 0, y: 0, width: 10, height: 10, opacity: 1, fills: [], strokes: [] };
    const v1 = makeFrame([nodeA]);
    const v2 = makeFrame([nodeB]);
    const result = svc.compareSnapshots(v1, v2);
    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(1);
    expect(result.totalChanges).toBe(2);
  });

  it('traverses deeply nested children', () => {
    const grandchild: NodeSnapshot = {
      id: 'grandchild', name: 'Icon', type: 'VECTOR',
      x: 0, y: 0, width: 20, height: 20,
      opacity: 1, fills: [], strokes: [],
    };
    const child: NodeSnapshot = {
      id: 'child', name: 'Group', type: 'GROUP',
      x: 0, y: 0, width: 40, height: 40,
      opacity: 1, fills: [], strokes: [],
      children: [grandchild],
    };
    const v1 = makeFrame([child]);
    const v2 = makeFrame([{ ...child, children: [] }]); // grandchild removed
    const result = svc.compareSnapshots(v1, v2);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]?.nodeName).toBe('Icon');
  });

  it('detects property change in child node', () => {
    const child: NodeSnapshot = { id: 'child', name: 'Box', type: 'RECTANGLE', x: 10, y: 10, width: 50, height: 50, opacity: 1, fills: [], strokes: [] };
    const v1 = makeFrame([child]);
    const v2 = makeFrame([{ ...child, x: 20 }]);
    const result = svc.compareSnapshots(v1, v2);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0]?.nodeName).toBe('Box');
    const xChange = result.modified[0]?.changes.find(c => c.property === 'x');
    expect(xChange?.delta).toBe('+10.00px');
  });
});

// ─── totalChanges accounting ──────────────────────────────────────────────────

describe('DiffService – totalChanges', () => {
  it('counts modified + added + removed correctly', () => {
    const v1: FigmaSnapshot = {
      figmaNodeId: 'root',
      figmaNodeName: 'Frame',
      capturedAt: new Date().toISOString(),
      root: {
        id: 'root', name: 'Frame', type: 'FRAME',
        x: 0, y: 0, width: 200, height: 200,
        opacity: 1, fills: [], strokes: [],
        children: [
          { id: 'stay', name: 'Stay', type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10, opacity: 1, fills: [], strokes: [] },
          { id: 'gone', name: 'Gone', type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10, opacity: 1, fills: [], strokes: [] },
        ],
      },
    };
    const v2: FigmaSnapshot = {
      ...v1,
      root: {
        ...v1.root,
        children: [
          { id: 'stay', name: 'Stay', type: 'RECTANGLE', x: 5, y: 0, width: 10, height: 10, opacity: 1, fills: [], strokes: [] }, // modified
          { id: 'new', name: 'New', type: 'ELLIPSE', x: 0, y: 0, width: 10, height: 10, opacity: 1, fills: [], strokes: [] },   // added
          // 'gone' removed
        ],
      },
    };
    const result = svc.compareSnapshots(v1, v2);
    expect(result.modified).toHaveLength(1);
    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(1);
    expect(result.totalChanges).toBe(3);
  });
});
