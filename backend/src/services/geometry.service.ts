import type { FigmaSnapshot, DeltaJSON } from '../types/figma.js';
import { findNodeById } from './svg-generator.service.js';
import { instanceRootMap, viewportRootMap } from './tree.service.js';

export type Bbox = { x: number; y: number; w: number; h: number };

/**
 * Bbox du nœud relative à une ORIGINE choisie (AABB visuelle si présente, sinon x/y/w/h bruts).
 * En page-centric l'origine est le viewport du nœud, la racine (PageNode) n'ayant pas de géométrie.
 */
export function nodeBboxIn(snapshot: FigmaSnapshot, nodeId: string, originId: string): Bbox | null {
  const node = findNodeById(snapshot.root, nodeId);
  const origin = findNodeById(snapshot.root, originId);
  if (!node || !origin) return null;
  const ob = origin.aabb;
  const ox = ob ? ob.x : origin.x;
  const oy = ob ? ob.y : origin.y;
  if (node.aabb) return { x: node.aabb.x - ox, y: node.aabb.y - oy, w: node.aabb.w, h: node.aabb.h };
  return { x: node.x - ox, y: node.y - oy, w: node.width, h: node.height };
}

/** Bbox relative à la racine du snapshot. Conservée pour le mode frame (lecture seule). */
export function nodeBboxRelative(snapshot: FigmaSnapshot, nodeId: string): Bbox | null {
  return nodeBboxIn(snapshot, nodeId, snapshot.root.id);
}

/**
 * Ajoute `frame` (dims root) + `bbox` par-nœud au delta, pour éviter de retélécharger le
 * snapshot au GET. Attache aussi `instanceRoot`/`instanceName`/`instanceBbox` aux nœuds internes
 * d'icônes/composants (INSTANCE) → le plugin replie leurs changements en UN SEUL élément
 * (une boîte = l'icône), au lieu d'un encadré par sous-vecteur. Géométrie mesurée dans le
 * snapshot d'origine du nœud : courant pour modified/added, précédent pour removed (cf. `bbox`).
 */
export function enrichDeltaGeometry(delta: DeltaJSON, currentSnap: FigmaSnapshot, prevSnap: FigmaSnapshot | null): DeltaJSON {
  const rb = currentSnap.root.aabb;
  const frame = { w: rb ? rb.w : currentSnap.root.width, h: rb ? rb.h : currentSnap.root.height };
  const curInst = instanceRootMap(currentSnap.root);
  const prevInst = prevSnap ? instanceRootMap(prevSnap.root) : null;

  // Page-centric : le repère devient le viewport. En mode frame (racine non-PAGE) les maps
  // restent nulles → origine = la racine, comportement d'origine strictement préservé.
  const curVp  = currentSnap.root.type === 'PAGE' ? viewportRootMap(currentSnap.root) : null;
  const prevVp = prevSnap?.root.type === 'PAGE'   ? viewportRootMap(prevSnap.root)    : null;

  const put = (
    arr: DeltaJSON['modified'],
    snap: FigmaSnapshot | null,
    inst: ReturnType<typeof instanceRootMap> | null,
    vp: ReturnType<typeof viewportRootMap> | null,
  ) =>
    arr.map(nd => {
      const root = inst?.get(nd.nodeId);
      const viewport = vp?.get(nd.nodeId);
      const origin = viewport?.id ?? snap?.root.id;
      return {
        ...nd,
        bbox: snap && origin ? (nodeBboxIn(snap, nd.nodeId, origin) ?? undefined) : undefined,
        instanceRoot: root?.id,
        instanceName: root?.name,
        instanceBbox: root && snap && origin ? (nodeBboxIn(snap, root.id, origin) ?? undefined) : undefined,
        viewport: viewport?.id,
      };
    });

  const modified = put(delta.modified, currentSnap, curInst, curVp);
  const added    = put(delta.added,    currentSnap, curInst, curVp);
  const removed  = put(delta.removed,  prevSnap,    prevInst, prevVp);

  return {
    ...delta, frame, modified, added, removed,
    viewports: buildViewports([...modified, ...added, ...removed], currentSnap),
  };
}

/**
 * Un cadre navigable par viewport touché. `changes` compte les GROUPES (clé = instanceRoot
 * ?? nodeId) : les nœuds internes d'une même icône comptent pour 1, sinon la liste des
 * frames afficherait un nombre que le viewer contredirait (cf. regroupement d'icônes).
 * Ordre = celui des enfants dans le snapshot, pour un affichage stable.
 */
function buildViewports(nodes: DeltaJSON['modified'], snap: FigmaSnapshot): DeltaJSON['viewports'] {
  if (snap.root.type !== 'PAGE') return undefined;
  const groups = new Map<string, Set<string>>();
  for (const nd of nodes) {
    if (!nd.viewport) continue;
    const set = groups.get(nd.viewport) ?? new Set<string>();
    set.add(nd.instanceRoot ?? nd.nodeId);
    groups.set(nd.viewport, set);
  }
  const out: NonNullable<DeltaJSON['viewports']> = [];
  for (const top of snap.root.children ?? []) {
    const set = groups.get(top.id);
    if (!set) continue;
    const ab = top.aabb;
    out.push({
      id: top.id, name: top.name,
      frame: { w: ab ? ab.w : top.width, h: ab ? ab.h : top.height },
      changes: set.size,
    });
  }
  return out;
}
