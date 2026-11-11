import { describe, it, expect } from 'vitest';
import { netDelta } from '../services/net-delta.service.js';
import type { FigmaSnapshot, NodeSnapshot } from '../types/figma.js';

const frame = (id: string, width: number, children: NodeSnapshot[] = []): NodeSnapshot => ({
  id, dg_id: id, name: id, type: 'FRAME', x: 0, y: 0, width, height: 50, opacity: 1, fills: [], strokes: [], children,
});
const page = (...frames: NodeSnapshot[]): FigmaSnapshot => ({
  figmaNodeId: 'p', figmaNodeName: 'P', capturedAt: '2026-11-11T00:00:00Z',
  root: { id: 'p', name: 'P', type: 'PAGE', x: 0, y: 0, width: 0, height: 0, opacity: 1, fills: [], strokes: [], children: frames },
});

describe('netDelta — changement net entre deux versions (depuis ta dernière visite)', () => {
  it('rien de changé → 0 changement (pas de résumé IA à générer)', () => {
    expect(netDelta(page(frame('A', 100)), page(frame('A', 100))).totalChanges).toBe(0);
  });
  it('une frame élargie et un calque ajouté → changements comptés', () => {
    const d = netDelta(page(frame('A', 100)), page(frame('A', 140, [frame('B', 10)])));
    expect(d.totalChanges).toBeGreaterThan(0);
    expect(d.added.map(a => a.nodeId)).toContain('B');
  });
});
