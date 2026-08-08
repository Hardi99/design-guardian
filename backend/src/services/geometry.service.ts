import type { FigmaSnapshot, DeltaJSON } from '../types/figma.js';
import { findNodeById } from './svg-generator.service.js';

export type Bbox = { x: number; y: number; w: number; h: number };

/** Bbox du nœud relative à la root (AABB visuelle si présente, sinon x/y/w/h bruts). Miroir de nodeBbox (branches.controller.ts). */
export function nodeBboxRelative(snapshot: FigmaSnapshot, nodeId: string): Bbox | null {
  const node = findNodeById(snapshot.root, nodeId);
  if (!node) return null;
  const rb = snapshot.root.aabb;
  const ox = rb ? rb.x : snapshot.root.x;
  const oy = rb ? rb.y : snapshot.root.y;
  if (node.aabb) return { x: node.aabb.x - ox, y: node.aabb.y - oy, w: node.aabb.w, h: node.aabb.h };
  return { x: node.x - snapshot.root.x, y: node.y - snapshot.root.y, w: node.width, h: node.height };
}

/** Ajoute `frame` (dims root) + `bbox` par-nœud au delta, pour éviter de retélécharger le snapshot au GET. */
export function enrichDeltaGeometry(delta: DeltaJSON, currentSnap: FigmaSnapshot, prevSnap: FigmaSnapshot | null): DeltaJSON {
  const rb = currentSnap.root.aabb;
  const frame = { w: rb ? rb.w : currentSnap.root.width, h: rb ? rb.h : currentSnap.root.height };
  const put = (arr: DeltaJSON['modified'], snap: FigmaSnapshot | null) =>
    arr.map(nd => ({ ...nd, bbox: snap ? (nodeBboxRelative(snap, nd.nodeId) ?? undefined) : undefined }));
  return {
    ...delta, frame,
    modified: put(delta.modified, currentSnap),
    added: put(delta.added, currentSnap),
    removed: put(delta.removed, prevSnap),
  };
}
