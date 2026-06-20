// Décide si deux captures suivent des éléments DIFFÉRENTS sur une même branche.
// L'id Figma est volatil : le restore par clone (#42) remplace le nœud par une copie
// aux NOUVEAUX ids. L'identité stable est le `dg_id`. Donc : ids Figma différents =
// mismatch SAUF si le `dg_id` racine correspond (même élément, re-cloné).
// Conservateur en legacy (pas de dg_id) : on garde l'ancienne sécurité (mismatch).

export interface NodeIdentity {
  figmaNodeId?: string;
  dgId?: string;
}

export function isNodeMismatch(prev: NodeIdentity, incoming: NodeIdentity): boolean {
  if (!prev.figmaNodeId || !incoming.figmaNodeId) return false; // rien à comparer
  if (prev.figmaNodeId === incoming.figmaNodeId) return false;  // même id Figma → OK
  // ids Figma différents : OK uniquement si même dg_id (re-cloné au restore).
  if (prev.dgId && incoming.dgId && prev.dgId === incoming.dgId) return false;
  return true;
}
