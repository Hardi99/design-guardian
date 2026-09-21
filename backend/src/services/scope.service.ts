import type { DeltaJSON, FigmaSnapshot } from '../types/figma.js';
import { viewportRootMap } from './tree.service.js';

/**
 * Sépare les changements de PÉRIMÈTRE des changements de DESIGN.
 *
 * Cocher ou décocher une frame entre deux checkpoints la ferait apparaître comme ajoutée
 * ou supprimée, avec tous ses descendants — alors que rien n'a bougé dans le design. Une
 * frame de 500 calques décochée produirait 500 fausses suppressions : le changelog
 * mentirait, et massivement.
 *
 * Les frames suivies sont exactement les enfants de la racine synthétique : comparer les
 * deux listes donne les entrées et sorties de périmètre, et les nœuds qui en dépendent
 * sont retirés de `added`/`removed`.
 *
 * Non-mutant. Sans effet hors page-centric (racine non-PAGE) ou sans version précédente.
 */
export function classifyScopeChanges(
  delta: DeltaJSON,
  currentSnap: FigmaSnapshot,
  prevSnap: FigmaSnapshot | null,
): DeltaJSON {
  if (!prevSnap || currentSnap.root.type !== 'PAGE' || prevSnap.root.type !== 'PAGE') return delta;

  const cur  = new Map((currentSnap.root.children ?? []).map(c => [c.id, c.name]));
  const prev = new Map((prevSnap.root.children ?? []).map(c => [c.id, c.name]));

  const scopeIn  = [...cur].filter(([id]) => !prev.has(id)).map(([id, name]) => ({ id, name }));
  const scopeOut = [...prev].filter(([id]) => !cur.has(id)).map(([id, name]) => ({ id, name }));
  if (scopeIn.length === 0 && scopeOut.length === 0) return delta;

  const inIds  = new Set(scopeIn.map(f => f.id));
  const outIds = new Set(scopeOut.map(f => f.id));
  const curVp  = viewportRootMap(currentSnap.root);
  const prevVp = viewportRootMap(prevSnap.root);

  return {
    ...delta,
    added:   delta.added.filter(n   => !inIds.has(curVp.get(n.nodeId)?.id   ?? '')),
    removed: delta.removed.filter(n => !outIds.has(prevVp.get(n.nodeId)?.id ?? '')),
    ...(scopeIn.length  > 0 ? { scopeIn }  : {}),
    ...(scopeOut.length > 0 ? { scopeOut } : {}),
  };
}
