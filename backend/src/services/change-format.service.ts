import type { PropertyChange } from '../types/figma.js';

export type ReadableChange =
  | { kind: 'color';      label: string; from: string; to: string }
  | { kind: 'weight';     label: string; from: string; to: string }
  | { kind: 'text';       label: string; from: string; to: string }
  | { kind: 'rotation';   label: string; degrees: number }
  | { kind: 'move';       label: string; dx: number; dy: number }
  | { kind: 'resize';     label: string; dw: number; dh: number }
  | { kind: 'opacity';    label: string; from: number; to: number }
  | { kind: 'visibility'; label: string; visible: boolean }
  | { kind: 'generic';    label: string; detail: string };

const WEIGHTS: Record<number, string> = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
};
export function weightName(v: unknown): string {
  return typeof v === 'number' && WEIGHTS[v] ? WEIGHTS[v] : String(v ?? '');
}

const str = (v: unknown): string => String(v ?? '');
function numDelta(c: PropertyChange): number {
  return typeof c.newValue === 'number' && typeof c.oldValue === 'number' ? c.newValue - c.oldValue : 0;
}
const pct = (v: unknown): number => (typeof v === 'number' ? Math.round(v * 100) : 0);

// Traduit UN changement de propriété en descripteur designer. Biais sûr : inconnu → generic.
// (x/y/width/height sont fusionnés en amont par formatNodeChanges, pas ici.)
export function formatChange(c: PropertyChange): ReadableChange {
  switch (c.property) {
    case 'fill':       return { kind: 'color', label: 'Couleur', from: str(c.oldValue), to: str(c.newValue) };
    case 'stroke':     return { kind: 'color', label: 'Contour', from: str(c.oldValue), to: str(c.newValue) };
    case 'fontWeight': return { kind: 'weight', label: 'Graisse', from: weightName(c.oldValue), to: weightName(c.newValue) };
    case 'fontFamily': return { kind: 'text', label: 'Police', from: str(c.oldValue), to: str(c.newValue) };
    case 'characters': return { kind: 'text', label: 'Texte', from: str(c.oldValue), to: str(c.newValue) };
    case 'rotation':   return { kind: 'rotation', label: 'Rotation', degrees: numDelta(c) };
    case 'opacity':    return { kind: 'opacity', label: 'Opacité', from: pct(c.oldValue), to: pct(c.newValue) };
    case 'visible':    return { kind: 'visibility', label: 'Visibilité', visible: c.newValue === true };
    default:           return { kind: 'generic', label: c.property, detail: c.delta ?? `${str(c.oldValue)} → ${str(c.newValue)}` };
  }
}
