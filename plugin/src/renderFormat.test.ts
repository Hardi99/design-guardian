import { describe, it, expect } from 'vitest';
import { chooseFormat, SVG_MAX_B64 } from './renderFormat';

describe('chooseFormat', () => {
  it('SVG léger → svg', () => expect(chooseFormat(500_000)).toBe('svg'));
  it('SVG lourd (images embarquées) → png', () => expect(chooseFormat(3_000_000)).toBe('png'));
  it('pile au seuil → svg (≤)', () => expect(chooseFormat(SVG_MAX_B64)).toBe('svg'));
  it('juste au-dessus → png', () => expect(chooseFormat(SVG_MAX_B64 + 1)).toBe('png'));
});
