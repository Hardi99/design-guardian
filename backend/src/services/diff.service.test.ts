import { describe, it, expect } from 'vitest';
import { DiffService } from './diff.service.js';
import type { FigmaSnapshot } from '../types/figma.js';

const baseSnapshot = (overrides: Partial<Parameters<typeof makeSnapshot>[0]> = {}): FigmaSnapshot =>
  makeSnapshot({ x: 0, y: 0, width: 100, height: 100, ...overrides });

function makeSnapshot(props: { x: number; y: number; width: number; height: number }): FigmaSnapshot {
  return {
    figmaNodeId: 'node-1',
    figmaNodeName: 'Test Node',
    capturedAt: new Date().toISOString(),
    root: {
      id: 'node-1',
      name: 'Test Node',
      type: 'RECTANGLE',
      x: props.x,
      y: props.y,
      width: props.width,
      height: props.height,
      opacity: 1,
      fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } }],
      strokes: [],
    },
  };
}

describe('DiffService', () => {
  const svc = new DiffService();

  it('returns zero changes for identical snapshots', () => {
    const s = baseSnapshot();
    const result = svc.compareSnapshots(s, s);
    expect(result.totalChanges).toBe(0);
    expect(result.modified).toHaveLength(0);
  });

  it('detects x position change above epsilon', () => {
    const v1 = baseSnapshot({ x: 10, y: 0, width: 100, height: 100 });
    const v2 = baseSnapshot({ x: 12.5, y: 0, width: 100, height: 100 });
    const result = svc.compareSnapshots(v1, v2);
    const xChange = result.modified[0]?.changes.find(c => c.property === 'x');
    expect(xChange).toBeDefined();
    expect(xChange?.delta).toBe('+2.50px');
  });

  it('ignores changes below epsilon (0.01px)', () => {
    const v1 = baseSnapshot({ x: 10, y: 0, width: 100, height: 100 });
    const v2 = baseSnapshot({ x: 10.005, y: 0, width: 100, height: 100 });
    const result = svc.compareSnapshots(v1, v2);
    expect(result.totalChanges).toBe(0);
  });

  it('detects fill color change', () => {
    const v1: FigmaSnapshot = {
      ...baseSnapshot(),
      root: {
        ...baseSnapshot().root,
        fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } }],
      },
    };
    const v2: FigmaSnapshot = {
      ...baseSnapshot(),
      root: {
        ...baseSnapshot().root,
        fills: [{ type: 'SOLID', color: { r: 0.33, g: 0.33, b: 0.33, a: 1 } }],
      },
    };
    const result = svc.compareSnapshots(v1, v2);
    const fillChange = result.modified[0]?.changes.find(c => c.property === 'fill');
    expect(fillChange).toBeDefined();
    expect(fillChange?.oldValue).toBe('#CCCCCC');
    expect(fillChange?.newValue).toBe('#545454');
  });

  it('detects added node', () => {
    const v1: FigmaSnapshot = {
      figmaNodeId: 'root',
      figmaNodeName: 'Frame',
      capturedAt: new Date().toISOString(),
      root: {
        id: 'root', name: 'Frame', type: 'FRAME',
        x: 0, y: 0, width: 200, height: 200,
        opacity: 1, fills: [], strokes: [],
        children: [],
      },
    };
    const v2: FigmaSnapshot = {
      ...v1,
      root: {
        ...v1.root,
        children: [{
          id: 'child-1', name: 'Circle', type: 'ELLIPSE',
          x: 50, y: 50, width: 40, height: 40,
          opacity: 1, fills: [], strokes: [],
        }],
      },
    };
    const result = svc.compareSnapshots(v1, v2);
    expect(result.added).toHaveLength(1);
    expect(result.added[0]?.nodeName).toBe('Circle');
  });

  it('detects removed node', () => {
    const v1: FigmaSnapshot = {
      figmaNodeId: 'root',
      figmaNodeName: 'Frame',
      capturedAt: new Date().toISOString(),
      root: {
        id: 'root', name: 'Frame', type: 'FRAME',
        x: 0, y: 0, width: 200, height: 200,
        opacity: 1, fills: [], strokes: [],
        children: [{
          id: 'child-1', name: 'Logo', type: 'VECTOR',
          x: 10, y: 10, width: 80, height: 80,
          opacity: 1, fills: [], strokes: [],
        }],
      },
    };
    const v2: FigmaSnapshot = { ...v1, root: { ...v1.root, children: [] } };
    const result = svc.compareSnapshots(v1, v2);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]?.nodeName).toBe('Logo');
  });

  it('includes processing metadata', () => {
    const s = baseSnapshot();
    const result = svc.compareSnapshots(s, s);
    expect(result.metadata.epsilon).toBe(0.01);
    expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
  });
});
