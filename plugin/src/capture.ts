// Lecture des propriétés capturées pour le diff (auto-layout, contours, ombres, composants).
// Logique PURE sur des sous-ensembles structurels des nœuds Figma : testable sans Figma.
import type { FigmaStroke, NodeSnapshot } from './types.js';

export interface AutoLayoutLike {
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutWrap?: string;
}
export interface PaintLike { type: string; color?: { r: number; g: number; b: number }; opacity?: number; visible?: boolean }
export interface EffectLike { type: string; spread?: number }
export interface TreeLike { id: string; type: string; children?: readonly TreeLike[] }
export interface MainLike { key: string; name: string; parent?: { type: string; name: string; key?: string } | null }
export type ComponentInfo = { key: string; name: string; set?: string; setKey?: string };

/** Auto-layout d'un cadre ; undefined s'il n'en a pas (layoutMode absent ou NONE). */
export function autoLayoutOf(n: AutoLayoutLike): NodeSnapshot['autoLayout'] {
  if (!n.layoutMode || n.layoutMode === 'NONE') return undefined;
  return {
    itemSpacing: n.itemSpacing ?? 0,
    paddingTop: n.paddingTop ?? 0, paddingRight: n.paddingRight ?? 0,
    paddingBottom: n.paddingBottom ?? 0, paddingLeft: n.paddingLeft ?? 0,
    primaryAxisAlignItems: n.primaryAxisAlignItems ?? '',
    counterAxisAlignItems: n.counterAxisAlignItems ?? '',
    layoutWrap: n.layoutWrap ?? '',
  };
}

/** Contour : couleur (uni seulement, alpha = opacité), opacité, visibilité. */
export function strokeOf(p: PaintLike): FigmaStroke {
  return {
    type: p.type,
    color: p.type === 'SOLID' && p.color ? { ...p.color, a: p.opacity ?? 1 } : undefined,
    opacity: p.opacity,
    visible: p.visible,
  };
}

/** Étalement d'une ombre (undefined pour un flou ou une ombre sans étalement). */
export function spreadOf(e: EffectLike): number | undefined {
  return typeof e.spread === 'number' ? e.spread : undefined;
}

/**
 * Variantes d'une instance : propriétés VARIANT et BOOLEAN (TEXT et INSTANCE_SWAP ignorées —
 * le texte est déjà comparé sur les nœuds, l'échange se voit sur l'instance enfant). Le suffixe
 * technique « #id » des propriétés booléennes est retiré du nom.
 */
export function variantOf(
  props: Record<string, { type: string; value: string | boolean }> | undefined,
): Record<string, string | boolean> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | boolean> = {};
  for (const [k, p] of Object.entries(props)) {
    if (p.type === 'VARIANT' || p.type === 'BOOLEAN') out[k.split('#')[0]] = p.value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Passe préalable : composant principal de chaque INSTANCE des arbres (imbriquées comprises),
 * lu EN PARALLÈLE (getMainComponentAsync est asynchrone en dynamic-page, l'extraction ne l'est
 * pas). Indexé par id d'instance ; une lecture qui échoue est simplement absente.
 */
export async function collectComponents(
  roots: readonly TreeLike[],
  getMain: (inst: TreeLike) => Promise<MainLike | null>,
): Promise<Map<string, ComponentInfo>> {
  const instances: TreeLike[] = [];
  const stack = [...roots];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n.type === 'INSTANCE') instances.push(n);
    if (n.children) stack.push(...n.children);
  }
  const results = await Promise.all(instances.map(inst => getMain(inst).catch(() => null)));
  const out = new Map<string, ComponentInfo>();
  results.forEach((m, i) => {
    if (!m) return;
    const inSet = m.parent?.type === 'COMPONENT_SET' ? m.parent : undefined;
    out.set(instances[i].id, {
      key: m.key, name: m.name,
      ...(inSet ? { set: inSet.name } : {}),
      ...(inSet?.key ? { setKey: inSet.key } : {}),
    });
  });
  return out;
}
