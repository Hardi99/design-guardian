import { describe, it, expect } from 'vitest';
import { generateSvgFromSnapshot, generateSvgFromNode, findNodeById } from './svg-generator.service.js';
import type { FigmaSnapshot, NodeSnapshot } from '../types/figma.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return {
    id: 'node-1',
    name: 'Rect',
    type: 'RECTANGLE',
    x: 0, y: 0, width: 100, height: 50,
    opacity: 1,
    visible: true,
    fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
    strokes: [],
    ...overrides,
  };
}

function makeSnapshot(node: NodeSnapshot): FigmaSnapshot {
  return {
    figmaNodeId: node.id,
    figmaNodeName: node.name,
    capturedAt: new Date().toISOString(),
    root: node,
  };
}

// ─── Basic SVG output ─────────────────────────────────────────────────────────

describe('generateSvgFromSnapshot – basic output', () => {
  it('returns a valid SVG string', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode()));
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('</svg>');
  });

  it('sets viewBox from root node dimensions', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({ width: 320, height: 240 })));
    expect(svg).toContain('viewBox="0 0 320 240"');
  });
});

// ─── RECTANGLE ────────────────────────────────────────────────────────────────

describe('generateSvgFromSnapshot – RECTANGLE', () => {
  it('renders a <rect> element', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({ type: 'RECTANGLE' })));
    expect(svg).toContain('<rect');
  });

  it('applies fill color', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
    })));
    expect(svg).toContain('#ff0000');
  });

  it('applies stroke color and weight', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1 }],
      strokeWeight: 2,
    })));
    expect(svg).toContain('#0000ff');
    expect(svg).toContain('stroke-width="2"');
  });

  it('applies corner radius', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({ cornerRadius: 8 })));
    expect(svg).toContain('rx="8"');
  });

  it('applies opacity', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({ opacity: 0.5 })));
    expect(svg).toContain('opacity="0.5"');
  });

  it('skips invisible nodes', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({ visible: false })));
    expect(svg).not.toContain('<rect');
  });
});

// ─── ELLIPSE ──────────────────────────────────────────────────────────────────

describe('generateSvgFromSnapshot – ELLIPSE', () => {
  it('renders an <ellipse> element', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({ type: 'ELLIPSE', width: 60, height: 60 })));
    expect(svg).toContain('<ellipse');
  });

  it('sets correct rx/ry from width/height', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({ type: 'ELLIPSE', width: 80, height: 40 })));
    expect(svg).toContain('rx="40"');
    expect(svg).toContain('ry="20"');
  });
});

// ─── TEXT ─────────────────────────────────────────────────────────────────────

describe('generateSvgFromSnapshot – TEXT', () => {
  it('renders a <text> element with characters', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({
      type: 'TEXT',
      characters: 'Hello World',
      fontSize: 16,
      fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1, a: 1 } }],
    })));
    expect(svg).toContain('<text');
    expect(svg).toContain('Hello World');
  });

  it('applies font-size', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({
      type: 'TEXT', characters: 'Test', fontSize: 24,
    })));
    expect(svg).toContain('font-size="24"');
  });
});

// ─── Gradient fills ───────────────────────────────────────────────────────────

describe('generateSvgFromSnapshot – gradient fills', () => {
  it('generates a <linearGradient> def for GRADIENT_LINEAR fills', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({
      fills: [{
        type: 'GRADIENT_LINEAR',
        gradientStops: [
          { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
          { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
        ],
      }],
    })));
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('<stop');
  });

  it('generates a <radialGradient> def for GRADIENT_RADIAL fills', () => {
    const svg = generateSvgFromSnapshot(makeSnapshot(makeNode({
      fills: [{
        type: 'GRADIENT_RADIAL',
        gradientStops: [
          { position: 0, color: { r: 1, g: 1, b: 0, a: 1 } },
          { position: 1, color: { r: 0, g: 1, b: 1, a: 0.5 } },
        ],
      }],
    })));
    expect(svg).toContain('<radialGradient');
  });
});

// ─── findNodeById ─────────────────────────────────────────────────────────────

describe('findNodeById', () => {
  const root: NodeSnapshot = {
    ...makeNode({ id: 'root', type: 'FRAME' }),
    children: [
      makeNode({ id: 'child-1', name: 'Child 1' }),
      {
        ...makeNode({ id: 'child-2', name: 'Child 2', type: 'GROUP' }),
        children: [makeNode({ id: 'grandchild', name: 'Deep' })],
      },
    ],
  };

  it('finds root node by id', () => {
    expect(findNodeById(root, 'root')?.id).toBe('root');
  });

  it('finds direct child by id', () => {
    expect(findNodeById(root, 'child-1')?.name).toBe('Child 1');
  });

  it('finds nested grandchild by id', () => {
    expect(findNodeById(root, 'grandchild')?.name).toBe('Deep');
  });

  it('returns null for unknown id', () => {
    expect(findNodeById(root, 'nonexistent')).toBeNull();
  });
});

// ─── generateSvgFromNode ──────────────────────────────────────────────────────

describe('generateSvgFromNode', () => {
  it('produces a standalone SVG for a single node', () => {
    const svg = generateSvgFromNode(makeNode({ width: 50, height: 50 }));
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('viewBox="0 0 50 50"');
  });
});
