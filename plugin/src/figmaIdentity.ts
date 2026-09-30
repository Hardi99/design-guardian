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
 * Viewer read-only : si le stamp ne peut pas être écrit, renvoie "" — un id tiré au
 * hasard à chaque capture n'apparierait jamais la précédente ; sans id, le diff apparie par id Figma.
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
    } catch { return ''; /* viewer read-only */ }
  }
  return decision.dgId;
}

/**
 * Couper-coller / « Move to page » : Figma donne un NOUVEL id au nœud, qui garde son
 * pluginData — `decideStamp` y verrait une copie et re-minterait (historique perdu).
 * C'est une copie seulement si le propriétaire existe encore ET porte toujours ce dg_id ;
 * sinon l'identité est libre et le nœud l'adopte (owner = lui). Un dg_id déjà tenu dans
 * l'ensemble capturé n'est jamais adopté une 2e fois (copie de l'original, ou collé deux fois).
 * Async (lookup Figma) : à appeler avant l'extraction synchrone.
 */
export async function adoptMovedIdentities(
  roots: readonly BranchNode[],
  getNode: (id: string) => Promise<IdentifiableNode | null>,
): Promise<void> {
  const nodes: BranchNode[] = [];
  const stack: BranchNode[] = [...roots];
  while (stack.length > 0) {
    const n = stack.pop()!;
    nodes.push(n);
    if (n.children) stack.push(...n.children);
  }

  const held = new Set<string>(); // dg_id tenus légitimement (owner = soi) dans l'arbre
  const candidates: BranchNode[] = [];
  for (const n of nodes) {
    const dgId = n.getPluginData(IDENTITY_KEY);
    if (!dgId) continue;
    if (n.getPluginData(OWNER_KEY) === n.id) held.add(dgId);
    else candidates.push(n);
  }

  for (const n of candidates) {
    const dgId = n.getPluginData(IDENTITY_KEY);
    if (held.has(dgId)) continue;
    const holder = await getNode(n.getPluginData(OWNER_KEY)).catch(() => null);
    if (holder && holder.getPluginData(IDENTITY_KEY) === dgId) continue; // vraie copie
    try {
      n.setPluginData(OWNER_KEY, n.id);
      held.add(dgId);
    } catch { /* viewer read-only */ }
  }
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
