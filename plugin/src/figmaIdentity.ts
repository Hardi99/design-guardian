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

/** Nœud arborescent (un nœud + ses enfants) — sous-ensemble structurel de SceneNode. */
export interface BranchNode extends IdentifiableNode {
  readonly children?: readonly BranchNode[];
}

/**
 * Propage l'identité de l'arbre `original` vers l'arbre `clone` (créé par `node.clone()`,
 * structurellement identique). Chaque nœud cloné reçoit le `dg_id` de son homologue
 * (→ correspondance cross-branche) MAIS `owner = son propre id` : il *possède* la clé,
 * donc `decideStamp` ne le prendra pas pour une copie à re-minter. Apparie par index.
 */
export function propagateIdentity(original: BranchNode, clone: BranchNode): void {
  const dgId = ensureNodeIdentity(original); // garantit que l'original a un dg_id
  try {
    clone.setPluginData(IDENTITY_KEY, dgId);
    clone.setPluginData(OWNER_KEY, clone.id);
  } catch { /* viewer read-only */ }

  const oc = original.children ?? [];
  const cc = clone.children ?? [];
  const n = Math.min(oc.length, cc.length);
  for (let i = 0; i < n; i++) propagateIdentity(oc[i], cc[i]);
}

/**
 * Cherche dans `roots` (et leurs descendants) le premier nœud dont le `dg_id`
 * correspond. Sert au restore cross-branche : retrouver, sur la page courante,
 * le nœud homologue (même `dg_id` propagé au clone) du snapshot à restaurer.
 */
export function findByDgId(roots: readonly BranchNode[], dgId: string): BranchNode | undefined {
  const stack: BranchNode[] = [...roots];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (readDgId(n) === dgId) return n;
    if (n.children) stack.push(...n.children);
  }
  return undefined;
}
