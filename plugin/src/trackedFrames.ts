// Découverte et suivi des frames d'une page. Le marquage vit dans le pluginData de la
// frame (comme dg_id) : il voyage avec le fichier et vaut pour tous les éditeurs, sans
// aucun aller-retour vers la base.
//
// Logique PURE, testable sans Figma : `TrackableNode` est un sous-ensemble structurel de
// SceneNode, sur le modèle de `IdentifiableNode` (figmaIdentity.ts).

export interface TrackableNode {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
  readonly children?: readonly TrackableNode[];
}

export const TRACKED_KEY = 'dg_tracked';

/**
 * Taux d'extraction MESURÉ (spikes 2 et 3 : 2 à 3 ms/nœud selon la profondeur et la
 * richesse des nœuds). On retient la borne haute : mieux vaut sur-estimer que promettre
 * une capture courte et en livrer une longue.
 */
export const MS_PER_NODE = 3;

/** Au-delà, l'UI avertit : le périmètre devient long à capturer (et gèle Figma). */
export const WARN_MS = 10_000;

export interface FrameEntry {
  id: string;
  name: string;
  type: string;
  tracked: boolean;
  nodes: number; // 0 pour une frame non suivie — elle n'est pas traversée
}

export function isTracked(n: TrackableNode): boolean {
  return n.getPluginData(TRACKED_KEY) === '1';
}

export function setTracked(n: TrackableNode, on: boolean): void {
  try { n.setPluginData(TRACKED_KEY, on ? '1' : ''); } catch { /* viewer read-only */ }
}

export function countNodes(n: TrackableNode): number {
  let total = 1;
  for (const c of n.children ?? []) total += countNodes(c);
  return total;
}

/**
 * Liste TOUTES les frames de premier niveau — l'utilisateur doit voir ce qu'il ne suit
 * pas, sinon l'omission redevient silencieuse. Seules les frames suivies sont traversées
 * pour être comptées : la traversée coûte ~0,13 ms/nœud, donc compter les 331 frames
 * d'une page réelle prendrait ~2 s et rendrait la liste poussive.
 */
export function listFrames(children: readonly TrackableNode[]): FrameEntry[] {
  return children.map(n => {
    const tracked = isTracked(n);
    return { id: n.id, name: n.name, type: n.type, tracked, nodes: tracked ? countNodes(n) : 0 };
  });
}

/** Coût d'extraction estimé du périmètre suivi, en millisecondes. */
export function estimateMs(frames: readonly FrameEntry[]): number {
  return frames.reduce((sum, f) => sum + (f.tracked ? f.nodes : 0), 0) * MS_PER_NODE;
}
