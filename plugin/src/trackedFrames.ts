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

import { IDENTITY_KEY } from './identity.js';

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
  key: string; // clé de navigation (Phase 3) : dg_id si la frame en a un, sinon son id
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
    // Lecture seule : lister ne stampe rien (le dg_id est posé à la capture).
    const key = n.getPluginData(IDENTITY_KEY) || n.id;
    return { id: n.id, key, name: n.name, type: n.type, tracked, nodes: tracked ? countNodes(n) : 0 };
  });
}

/** Coût d'extraction estimé du périmètre suivi, en millisecondes. */
export function estimateMs(frames: readonly FrameEntry[]): number {
  return frames.reduce((sum, f) => sum + (f.tracked ? f.nodes : 0), 0) * MS_PER_NODE;
}

export interface Box { id: string; x: number; y: number; w: number; h: number }

/**
 * Éléments « flottants » : posés sur la page (hors frame), typiquement après un collage
 * sans frame sélectionnée, mais visuellement sur une frame suivie. Chacun est rattaché à
 * la frame suivie où tombe son centre — la plus haute si plusieurs se chevauchent (ordre
 * des calques : dernier = au-dessus). Un élément au moins aussi grand que la frame
 * (autre écran, fond) n'est pas rattaché. Renvoie id de l'élément → id de la frame.
 */
export function assignFloating(candidates: readonly Box[], hosts: readonly Box[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of candidates) {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    for (let i = hosts.length - 1; i >= 0; i--) {
      const h = hosts[i];
      if (c.w >= h.w && c.h >= h.h) continue;
      if (cx >= h.x && cx <= h.x + h.w && cy >= h.y && cy <= h.y + h.h) { out.set(c.id, h.id); break; }
    }
  }
  return out;
}
