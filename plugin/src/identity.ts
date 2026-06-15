// ⚠️ PROTOCOLE D'IDENTITÉ PERSISTÉ — NE JAMAIS RENOMMER (cf. spec §5.5).
// Ces strings sont écrites dans les fichiers Figma des utilisateurs. Elles sont
// volontairement BRAND-NEUTRES : le produit sera renommé, ces clés doivent survivre.
export const IDENTITY_KEY = 'el_uid';
export const OWNER_KEY = 'el_owner';

/** UUID v4 basé sur Math.random (le sandbox Figma n'expose pas `crypto` de façon fiable). */
export function generateDgId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface StoredStamp { dgId?: string; ownerNodeId?: string }
export interface StampDecision { dgId: string; ownerNodeId: string; mustWrite: boolean }

/**
 * Décide le stamp d'identité d'un nœud (logique pure, sans Figma).
 * - pas de `dgId` → bootstrap (mint, owner = ce nœud).
 * - `dgId` présent mais `ownerNodeId` ≠ ce nœud → copie (copier-coller/Ctrl+D) → re-mint.
 * - `dgId` présent et owner = ce nœud → conservé.
 */
export function decideStamp(
  currentNodeId: string,
  stored: StoredStamp,
  mint: () => string = generateDgId,
): StampDecision {
  if (!stored.dgId || stored.ownerNodeId !== currentNodeId) {
    return { dgId: mint(), ownerNodeId: currentNodeId, mustWrite: true };
  }
  return { dgId: stored.dgId, ownerNodeId: currentNodeId, mustWrite: false };
}
