import { describe, it, expect } from 'vitest';
import { scoreChange } from '../services/significance.service.js';
import type { PropertyChange } from '../types/figma.js';

const ch = (over: Partial<PropertyChange>): PropertyChange =>
  ({ property: 'x', oldValue: 0, newValue: 0, ...over });

describe('scoreChange', () => {
  it('propriété qualitative (fills) → toujours notable', () => {
    expect(scoreChange(ch({ property: 'fills', oldValue: 'a', newValue: 'b' }))).toBe('notable');
  });

  it('texte (characters) → notable', () => {
    expect(scoreChange(ch({ property: 'characters', oldValue: 'Hi', newValue: 'Hello' }))).toBe('notable');
  });

  it('déplacement ≥ 1px → notable', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: 10, newValue: 12 }))).toBe('notable');
  });

  it('déplacement < 1px → minor', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: 10, newValue: 10.3 }))).toBe('minor');
  });

  it('opacité : Δ ≥ 0.05 → notable, sinon minor', () => {
    expect(scoreChange(ch({ property: 'opacity', oldValue: 1, newValue: 0.9 }))).toBe('notable');
    expect(scoreChange(ch({ property: 'opacity', oldValue: 1, newValue: 0.99 }))).toBe('minor');
  });

  it('rotation : Δ ≥ 1° → notable, sinon minor', () => {
    expect(scoreChange(ch({ property: 'rotation', oldValue: 0, newValue: 2 }))).toBe('notable');
    expect(scoreChange(ch({ property: 'rotation', oldValue: 0, newValue: 0.2 }))).toBe('minor');
  });

  it('propriété inconnue → conservateur (notable)', () => {
    expect(scoreChange(ch({ property: 'mysteryProp', oldValue: 1, newValue: 1 }))).toBe('notable');
  });

  it('valeurs non numériques sur prop numérique → conservateur (notable)', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: undefined, newValue: 5 }))).toBe('notable');
  });
});
