# SP1 — Fondation identité (Partie 1 : noyau + stamping capture) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque capture stampe sur chaque nœud un `dg_id` stable, persisté dans le `pluginData` Figma sous une clé gelée brand-neutre, avec re-mint automatique des copies (copier-coller / Ctrl+D).

**Architecture:** Logique d'identité **pure** isolée dans `identity.ts` (testable sans Figma) ; adaptateur fin `figmaIdentity.ts` qui dépend d'une interface minimale `IdentifiableNode` (donc testable avec un faux nœud) ; câblage dans `extractSnapshot` (capture). Le champ `dg_id` est ajouté au type `NodeSnapshot` et au schéma Zod backend (sinon Zod le supprime silencieusement).

**Tech Stack:** TypeScript strict, Vitest, plugin Figma (`create-figma-plugin`), backend Hono/Zod.

**Périmètre :** ce plan ne couvre QUE le noyau + le stamping à la capture. La **propagation au clone** (branch) et le **re-câblage du restore sur `dg_id`** (+ fixes W1/W3/W4/W6) sont des plans suivants (SP1 Partie 2 / Partie 3). Réf. spec : `docs/superpowers/specs/2026-06-11-modele-metier-unifie-design.md` (§5).

---

## File Structure

- **Create** `plugin/src/identity.ts` — noyau pur : clés gelées, `generateDgId`, `decideStamp`. Aucune dépendance Figma.
- **Create** `plugin/src/identity.test.ts` — tests du noyau pur.
- **Create** `plugin/src/figmaIdentity.ts` — adaptateur : `ensureNodeIdentity`, `readDgId`. Dépend de l'interface `IdentifiableNode`.
- **Create** `plugin/src/figmaIdentity.test.ts` — tests avec faux nœud.
- **Modify** `plugin/src/types.ts` — ajout `dg_id` à `NodeSnapshot`.
- **Modify** `plugin/src/main.ts:362-413` — `extractSnapshot` stampe et inclut `dg_id`.
- **Modify** `backend/src/types/api.ts` — `nodeSnapshotSchema` accepte `dg_id` optionnel.

---

## Task 1 : Noyau pur `identity.ts`

**Files:**
- Create: `plugin/src/identity.ts`
- Test: `plugin/src/identity.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `plugin/src/identity.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { generateDgId, decideStamp } from './identity.js';

describe('generateDgId', () => {
  it('produit un UUID v4 valide', () => {
    expect(generateDgId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('produit des valeurs différentes', () => {
    expect(generateDgId()).not.toBe(generateDgId());
  });
});

describe('decideStamp', () => {
  const mint = () => 'NEW';

  it('aucun stamp → bootstrap (mint + owner = ce nœud, à écrire)', () => {
    expect(decideStamp('node-1', {}, mint)).toEqual({
      dgId: 'NEW', ownerNodeId: 'node-1', mustWrite: true,
    });
  });

  it('stamp valide appartenant à ce nœud → conservé, rien à écrire', () => {
    expect(decideStamp('node-1', { dgId: 'ABC', ownerNodeId: 'node-1' }, mint)).toEqual({
      dgId: 'ABC', ownerNodeId: 'node-1', mustWrite: false,
    });
  });

  it('stamp dont owner ≠ ce nœud (copie) → re-mint', () => {
    expect(decideStamp('node-2', { dgId: 'ABC', ownerNodeId: 'node-1' }, mint)).toEqual({
      dgId: 'NEW', ownerNodeId: 'node-2', mustWrite: true,
    });
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `cd plugin && npx vitest run src/identity.test.ts`
Expected: FAIL — `Failed to resolve import "./identity.js"` (le module n'existe pas).

- [ ] **Step 3 : Implémenter `identity.ts`**

Create `plugin/src/identity.ts` :

```ts
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
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run: `cd plugin && npx vitest run src/identity.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5 : Commit**

```bash
git add plugin/src/identity.ts plugin/src/identity.test.ts
git commit -m "feat(plugin): noyau pur d'identité (dg_id, decideStamp, clés gelées)"
```

---

## Task 2 : Adaptateur Figma `figmaIdentity.ts`

**Files:**
- Create: `plugin/src/figmaIdentity.ts`
- Test: `plugin/src/figmaIdentity.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `plugin/src/figmaIdentity.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { ensureNodeIdentity, readDgId, type IdentifiableNode } from './figmaIdentity.js';

// Faux nœud minimal : implémente uniquement ce que l'adaptateur utilise.
function fakeNode(id: string, data: Record<string, string> = {}): IdentifiableNode {
  return {
    id,
    getPluginData: (k) => data[k] ?? '',
    setPluginData: (k, v) => { data[k] = v; },
  };
}

describe('ensureNodeIdentity', () => {
  it('nœud vierge → mint + persiste dg_id et owner', () => {
    const store: Record<string, string> = {};
    const node = fakeNode('node-1', store);
    const id = ensureNodeIdentity(node);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.el_uid).toBe(id);
    expect(store.el_owner).toBe('node-1');
  });

  it('nœud déjà stampé (owner = lui) → dg_id stable, pas de réécriture', () => {
    const store: Record<string, string> = { el_uid: 'ABC', el_owner: 'node-1' };
    const node = fakeNode('node-1', store);
    expect(ensureNodeIdentity(node)).toBe('ABC');
    expect(store.el_uid).toBe('ABC');
  });

  it('copie (owner ≠ lui) → re-mint un nouveau dg_id + owner = lui', () => {
    const store: Record<string, string> = { el_uid: 'ABC', el_owner: 'node-1' };
    const node = fakeNode('node-2', store);
    const id = ensureNodeIdentity(node);
    expect(id).not.toBe('ABC');
    expect(store.el_uid).toBe(id);
    expect(store.el_owner).toBe('node-2');
  });
});

describe('readDgId', () => {
  it('renvoie le dg_id stocké', () => {
    expect(readDgId(fakeNode('n', { el_uid: 'ABC' }))).toBe('ABC');
  });
  it('renvoie "" si absent', () => {
    expect(readDgId(fakeNode('n'))).toBe('');
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `cd plugin && npx vitest run src/figmaIdentity.test.ts`
Expected: FAIL — `Failed to resolve import "./figmaIdentity.js"`.

- [ ] **Step 3 : Implémenter `figmaIdentity.ts`**

Create `plugin/src/figmaIdentity.ts` :

```ts
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
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run: `cd plugin && npx vitest run src/figmaIdentity.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5 : Commit**

```bash
git add plugin/src/figmaIdentity.ts plugin/src/figmaIdentity.test.ts
git commit -m "feat(plugin): adaptateur figmaIdentity (ensureNodeIdentity, readDgId)"
```

---

## Task 3 : Câblage capture + type + schéma Zod

**Files:**
- Modify: `plugin/src/types.ts:31-48` (ajout `dg_id` à `NodeSnapshot`)
- Modify: `plugin/src/main.ts:362-364` (`extractSnapshot` stampe `dg_id`)
- Modify: `backend/src/types/api.ts` (`nodeSnapshotSchema` accepte `dg_id`)

- [ ] **Step 1 : Ajouter `dg_id` au type `NodeSnapshot`**

In `plugin/src/types.ts`, modifier l'interface `NodeSnapshot` — ajouter le champ en tête :

```ts
export interface NodeSnapshot {
  dg_id?: string; // identité stable (cf. spec §5) — optionnel le temps de la migration
  id: string; name: string; type: string;
  x: number; y: number; width: number; height: number; opacity: number;
  // … (reste inchangé)
```

- [ ] **Step 2 : Câbler `ensureNodeIdentity` dans `extractSnapshot`**

In `plugin/src/main.ts` :

1. Ajouter l'import en tête du fichier (avec les autres imports) :
```ts
import { ensureNodeIdentity } from './figmaIdentity.js';
```

2. Dans `extractSnapshot` (l.362-364), ajouter `dg_id` comme première propriété de l'objet retourné :
```ts
function extractSnapshot(node: SceneNode): NodeSnapshot {
  return {
    dg_id: ensureNodeIdentity(node),
    id: node.id,
    name: node.name,
    // … (reste inchangé)
```

- [ ] **Step 3 : Autoriser `dg_id` dans le schéma Zod backend**

In `backend/src/types/api.ts`, dans `nodeSnapshotSchema` (le `z.object` de `nodeSnapshotSchema`), ajouter le champ en tête de l'objet (Zod supprime sinon le champ silencieusement) :

```ts
const nodeSnapshotSchema: z.ZodType = z.lazy(() =>
  z.object({
    dg_id: z.string().optional(),
    id: z.string(), name: z.string(), type: z.string(),
    // … (reste inchangé)
```

- [ ] **Step 4 : Vérifier le typecheck (plugin + backend)**

Run: `cd plugin && npx tsc --noEmit`
Expected: exit 0 (aucune erreur).

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5 : Lancer toute la suite plugin (non-régression)**

Run: `cd plugin && npx vitest run`
Expected: PASS — les tests existants + les 10 nouveaux (identity 5 + figmaIdentity 5).

- [ ] **Step 6 : Commit**

```bash
git add plugin/src/types.ts plugin/src/main.ts backend/src/types/api.ts
git commit -m "feat: capture stampe dg_id (type NodeSnapshot + Zod backend)"
```

---

## Vérification manuelle (post-plan, dans Figma)

Le câblage `extractSnapshot` touche `figma.*` → non couvert par les tests unitaires. Après exécution :
1. Charger le plugin local, sélectionner un frame, capturer un checkpoint.
2. Vérifier en base (MCP `supabase-local`) que `snapshot_json`… — ⚠️ rappel : `snapshot_json` est `null` post-migration 008, le snapshot est dans **Storage**. Vérifier plutôt le payload réseau ou logguer `root.dg_id` côté UI.
3. Re-capturer le même nœud → le `dg_id` doit être **identique** (stable).
4. Dupliquer le nœud (Ctrl+D) puis capturer → la copie doit avoir un `dg_id` **différent** (re-mint).

---

## Self-Review (rempli par l'auteur du plan)

- **Couverture spec §5.1-5.4** : minting (Task 1/2), stockage clé gelée (Task 1 constantes), détection copie via owner (Task 1 `decideStamp` + Task 2), câblage capture (Task 3). §5.5 rebrand : clés brand-neutres `el_uid`/`el_owner` (Task 1). ✅
- **Hors périmètre (plans suivants)** : propagation au clone (branch), re-câblage restore + W1/W3/W4/W6, reconcile de doublons au niveau arbre (cas rare où deux nœuds owner=self partagent un dg_id). Noté en tête.
- **Placeholders** : aucun — code complet à chaque étape.
- **Cohérence des types** : `IDENTITY_KEY='el_uid'`/`OWNER_KEY='el_owner'` utilisés identiquement dans `identity.ts`, l'adaptateur et les tests ; `StampDecision`/`decideStamp` signatures constantes ; `dg_id` (snake_case) cohérent entre `NodeSnapshot`, `extractSnapshot` et le schéma Zod.
