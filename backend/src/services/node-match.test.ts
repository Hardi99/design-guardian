import { describe, it, expect } from 'vitest';
import { isNodeMismatch } from './node-match.js';

describe('isNodeMismatch', () => {
  it('pas d\'id Figma précédent → pas de mismatch (rien à comparer)', () => {
    expect(isNodeMismatch({}, { figmaNodeId: '1:2' })).toBe(false);
  });

  it('même id Figma → pas de mismatch', () => {
    expect(isNodeMismatch({ figmaNodeId: '1:2' }, { figmaNodeId: '1:2' })).toBe(false);
  });

  it('ids Figma différents MAIS même dg_id → pas de mismatch (élément re-cloné au restore)', () => {
    expect(isNodeMismatch(
      { figmaNodeId: '1:2', dgId: 'ABC' },
      { figmaNodeId: '9:9', dgId: 'ABC' },
    )).toBe(false);
  });

  it('ids Figma différents ET dg_id différents → mismatch (vraiment un autre élément)', () => {
    expect(isNodeMismatch(
      { figmaNodeId: '1:2', dgId: 'ABC' },
      { figmaNodeId: '9:9', dgId: 'XYZ' },
    )).toBe(true);
  });

  it('ids Figma différents, dg_id absent (legacy) → mismatch (conservateur, garde l\'ancienne sécurité)', () => {
    expect(isNodeMismatch({ figmaNodeId: '1:2' }, { figmaNodeId: '9:9' })).toBe(true);
  });
});
