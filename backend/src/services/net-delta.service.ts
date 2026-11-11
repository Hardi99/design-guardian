import { DiffService } from './diff.service.js';
import { stampSignificance } from './significance.service.js';
import { classifyScopeChanges } from './scope.service.js';
import { enrichDeltaGeometry } from './geometry.service.js';
import type { DeltaJSON, FigmaSnapshot } from '../types/figma.js';

const diffService = new DiffService();

/** Diff complet prev → next : brut, significativité, périmètre (on CLASSE avant d'enrichir,
 *  pour ne pas enrichir des nœuds qu'on retire), puis géométrie. Capture, restauration, comparaison. */
export function netDelta(prev: FigmaSnapshot, next: FigmaSnapshot): DeltaJSON {
  const scoped = classifyScopeChanges(stampSignificance(diffService.compareSnapshots(prev, next), next), next, prev);
  return enrichDeltaGeometry(scoped, next, prev);
}
