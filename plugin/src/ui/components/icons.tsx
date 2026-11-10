// Icônes SVG (trait 1.5, couleur héritée) : rendu identique quelle que soit la police,
// contrairement aux caractères ← ◀ ⋯ ou aux emojis. Décoratives : le libellé est porté
// par le bouton (aria-label).
import type { ComponentChildren } from 'preact';

function Icon({ size = 14, children }: { size?: number; children: ComponentChildren }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="flex-shrink-0">{children}</svg>
  );
}

export const IconBack    = () => <Icon><path d="M10 3 5 8l5 5" /></Icon>;
export const IconPrev    = () => <Icon><path d="M10 4 6 8l4 4" /></Icon>;
export const IconNext    = () => <Icon><path d="m6 4 4 4-4 4" /></Icon>;
export const IconLocate = () => <Icon><circle cx="8" cy="8" r="3" /><path d="M8 1.5v2.5M8 12v2.5M1.5 8H4M12 8h2.5" /></Icon>;
export const IconChevron = () => <Icon size={12}><path d="m6 4 4 4-4 4" /></Icon>;
export const IconMore    = () => <Icon><circle cx="3.5" cy="8" r=".75" fill="currentColor" /><circle cx="8" cy="8" r=".75" fill="currentColor" /><circle cx="12.5" cy="8" r=".75" fill="currentColor" /></Icon>;
export const IconRestore = () => <Icon><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" /><path d="M2.5 2.5v2.6h2.6" /></Icon>;
export const IconCamera  = ({ size }: { size?: number }) => <Icon size={size}><path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h1.3l1-1.5h4.4l1 1.5h1.3A1.5 1.5 0 0 1 14 5.5v6A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" /><circle cx="8" cy="8.5" r="2.25" /></Icon>;
export const IconCheck   = () => <Icon size={12}><path d="m3 8.5 3 3 7-7" /></Icon>;
export const IconWarn    = () => <Icon size={12}><path d="M8 2.5 14 13H2z" /><path d="M8 6.5v3M8 11.2v.1" /></Icon>;
export const IconStar    = () => <Icon size={11}><path d="m8 2 1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z" /></Icon>;
// Étincelle IA : remplie, c'est la signature visuelle du résumé (ce que le produit vend).
export function IconSparkle({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" class="flex-shrink-0" fill="currentColor">
      <path d="M8 1.5c.4 2.9 1.6 4.1 4.5 4.5-2.9.4-4.1 1.6-4.5 4.5-.4-2.9-1.6-4.1-4.5-4.5C6.4 5.6 7.6 4.4 8 1.5z" />
      <path d="M12.5 10c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2z" opacity=".7" />
    </svg>
  );
}
