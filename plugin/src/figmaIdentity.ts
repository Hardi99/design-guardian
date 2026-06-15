import { IDENTITY_KEY, OWNER_KEY, decideStamp } from './identity.js';

/** Sous-ensemble structurel de BaseNode utilisé par l'adaptateur (testable sans Figma). */
export interface IdentifiableNode {
  id: string;
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
}

/**
 * Garantit que le nœud porte un `dg_id` stable et le renvoie.
 * Lit le pluginData, applique `decideStamp`, persiste si nécessaire.
 * Tolère les viewers read-only (l'écriture échoue → dg_id volatile pour la session).
 */
export function ensureNodeIdentity(node: IdentifiableNode): string {
  const decision = decideStamp(node.id, {
    dgId: node.getPluginData(IDENTITY_KEY) || undefined,
    ownerNodeId: node.getPluginData(OWNER_KEY) || undefined,
  });
  if (decision.mustWrite) {
    try {
      node.setPluginData(IDENTITY_KEY, decision.dgId);
      node.setPluginData(OWNER_KEY, decision.ownerNodeId);
    } catch { /* viewer read-only — dg_id volatile pour cette session */ }
  }
  return decision.dgId;
}

/** Lit le `dg_id` persisté (ou "" si absent). Ne mint pas. */
export function readDgId(node: IdentifiableNode): string {
  return node.getPluginData(IDENTITY_KEY) || '';
}
