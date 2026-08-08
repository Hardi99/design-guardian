import { describe, it, expect } from 'vitest';
import { clampView } from './canvasView.js';

describe('clampView', () => {
  it('borne le scale au minimum (fit)', () => {
    expect(clampView({ scale: 0.2, tx: 0, ty: 0 }, 0.5, 8).scale).toBe(0.5);
  });
  it('borne le scale au maximum', () => {
    expect(clampView({ scale: 20, tx: 0, ty: 0 }, 0.5, 8).scale).toBe(8);
  });
  it('laisse un scale valide inchangé', () => {
    expect(clampView({ scale: 2, tx: 10, ty: -5 }, 0.5, 8)).toEqual({ scale: 2, tx: 10, ty: -5 });
  });
});
