import { describe, it, expect } from 'vitest';
import { figmaFillSchema } from '../types/api.js';

describe('figmaFillSchema — IMAGE fills', () => {
  it('conserve imageHash et scaleMode (anti-strip silencieux)', () => {
    const parsed = figmaFillSchema.parse({ type: 'IMAGE', imageHash: 'abc123', scaleMode: 'FILL' });
    expect(parsed.imageHash).toBe('abc123');
    expect(parsed.scaleMode).toBe('FILL');
  });

  it('accepte toujours un fill SOLID sans champs image', () => {
    const parsed = figmaFillSchema.parse({ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } });
    expect(parsed.type).toBe('SOLID');
    expect(parsed.imageHash).toBeUndefined();
  });
});
