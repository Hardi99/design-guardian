# Trous de détection du diff — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** que le diff détecte et nomme en clair les changements courants qui lui échappent aujourd'hui : couleurs d'un dégradé, image remplacée, contours (ajout, suppression, couleur, visibilité), ombres (décalage, étalement, type), auto-layout (direction, espacement, marges, alignements, retour à la ligne), composant échangé et variante changée.

**Architecture :** deux côtés. **Plugin** : l'extraction capture les propriétés manquantes ; le composant principal d'une instance se lit en asynchrone (`getMainComponentAsync`, obligatoire en `documentAccess: dynamic-page`), donc une **passe préalable** le relève avant l'extraction synchrone, comme `adoptMovedIdentities`. La logique de lecture est isolée dans un module **pur** testé avec de faux nœuds. **Backend** : le diff compare ces propriétés, `change-format` les nomme, `significance` les classe. Une propriété **absente d'un côté** (capture ancienne) ne produit **jamais** de changement.

**Tech Stack :** TypeScript strict, Vitest, Preact (plugin Figma), HonoJS + Zod.

**Spec :** pas de spec dédiée — ce plan répond au constat de l'audit du 2026-09-30 (liste des propriétés non comparées, `backend/src/services/diff.service.ts`). Référence de comportement : `PIPELINE.md` (étape 2, diff) et la règle « dans le doute, on montre » de `significance.service.ts`. Rulings sans spec : provisoires, à consigner.

## Global Constraints

- TypeScript strict, **zéro `any`**. Séparation Service / Controller.
- `figma.*` **uniquement** dans le main thread (`main.ts`).
- Tout champ ajouté au snapshot DOIT être ajouté au **schéma Zod** (`backend/src/types/api.ts`, `nodeSnapshotSchema` et schémas imbriqués) **et** aux types des deux côtés (`backend/src/types/figma.ts`, `plugin/src/types.ts`) — sinon Zod le supprime **en silence**.
- **Rétrocompatibilité** : une propriété absente d'au moins un des deux snapshots (capture antérieure à ce plan) n'est **pas** comparée. Aucune fausse modification sur l'historique existant.
- Tolérances : couleurs `colorsEqual` existant (0,004) ; positions de dégradé et géométrie `EPSILON = 0.01`.
- Libellés lisibles en français, via `change-format.service.ts`.
- **Baseline : 288 tests backend + 180 plugin** — aucune régression tolérée.
- La **restauration** n'est pas étendue à ces propriétés (Phase 4 / chantier restauration) : hors périmètre.

## Review Focus

1. **Snapshot ancien d'un côté** (sans `autoLayout`, `component`, `spread`, `visible` de contour…) → aucun changement signalé pour ces propriétés. → test tâche 2 et tâche 3 (« capture ancienne »).
2. **Bruit flottant** sur les étapes d'un dégradé (0,300000001 vs 0,3) → pas de changement. → test tâche 2.
3. **Changement de variante** (même jeu de composants, variante différente) → **une** ligne « Variante : Taille Large → Small », pas en plus « Composant échangé ». → test tâche 3.
4. **Page avec beaucoup d'instances** (icônes) → la passe préalable lit les composants principaux **en parallèle** (`Promise.all`), pas l'un après l'autre ; le temps est **mesuré** à la vérification manuelle (tâche 6). → test tâche 5 (toutes les instances résolues, y compris imbriquées).
5. **Contour ajouté ou supprimé** (liste vide d'un côté) → signalé (aujourd'hui silencieux). → test tâche 2.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `backend/src/types/figma.ts` | Nouveaux champs de snapshot (`FigmaStroke.visible`, `FigmaEffect.spread`, `FigmaFill.imageHash/scaleMode`, `NodeSnapshot.autoLayout`, `NodeSnapshot.component`) | Modifier |
| `backend/src/types/api.ts` | Schéma Zod correspondant | Modifier |
| `backend/src/services/diff.service.ts` | Comparaison : peintures (remplissages **et** contours), ombres, auto-layout, composant | Modifier |
| `backend/src/services/change-format.service.ts` | Libellés lisibles des nouvelles propriétés | Modifier |
| `backend/src/services/significance.service.ts` | Seuils des nouvelles propriétés numériques | Modifier |
| `plugin/src/capture.ts` | Lecture pure : auto-layout, contours, ombres, instance ; passe préalable des composants | Créer |
| `plugin/src/capture.test.ts` | Tests avec faux nœuds | Créer |
| `plugin/src/main.ts`, `plugin/src/types.ts` | Branchement dans `extractSnapshot` et `handleSnapshot` | Modifier |
| `PIPELINE.md`, `CHANGELOG.md` | Propriétés comparées | Modifier |

---

## Task 1 : Types et schéma des nouveaux champs

**Files :** Modify `backend/src/types/figma.ts`, `backend/src/types/api.ts`, `plugin/src/types.ts` · Test `backend/src/tests/api.schema.test.ts`

**Interfaces — Produces :**

```ts
// FigmaFill (backend : aligner sur le plugin, qui les capture déjà)
imageHash?: string;
scaleMode?: string;
// FigmaStroke
visible?: boolean;
// FigmaEffect
spread?: number;
// NodeSnapshot
autoLayout?: {
  itemSpacing: number;
  paddingTop: number; paddingRight: number; paddingBottom: number; paddingLeft: number;
  primaryAxisAlignItems: string;   // 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'
  counterAxisAlignItems: string;   // 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'
  layoutWrap: string;              // 'NO_WRAP' | 'WRAP'
};                                  // présent seulement si layoutMode ≠ NONE
component?: {
  key: string;                      // clé du composant principal (identité)
  name: string;                     // nom lisible
  set?: string;                     // nom du jeu de composants (variantes), si variante
  variant?: Record<string, string | boolean>; // propriétés VARIANT et BOOLEAN de l'instance
};                                  // présent seulement sur une INSTANCE
```

- [ ] **Step 1 : test qui échoue** — dans `api.schema.test.ts`, un snapshot dont la racine porte `autoLayout`, `component`, un remplissage `IMAGE` avec `imageHash`/`scaleMode`, un contour avec `visible: false` et une ombre avec `spread: 4` : après `createCheckpointSchema.parse`, chacun de ces champs est **conservé** (même motif que le test `layoutMode` existant).

```ts
describe('createCheckpointSchema — champs des trous de détection', () => {
  it('conserve autoLayout, component, imageHash/scaleMode, contour visible, ombre spread', () => {
    const root = {
      id: 'n', name: 'n', type: 'INSTANCE', x: 0, y: 0, width: 1, height: 1, opacity: 1,
      fills: [{ type: 'IMAGE', imageHash: 'h1', scaleMode: 'FILL' }],
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, visible: false }],
      effects: [{ type: 'DROP_SHADOW', visible: true, radius: 4, spread: 4, offset: { x: 0, y: 2 } }],
      layoutMode: 'HORIZONTAL',
      autoLayout: { itemSpacing: 8, paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 4,
        primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'CENTER', layoutWrap: 'NO_WRAP' },
      component: { key: 'k1', name: 'Button', set: 'Button', variant: { Size: 'Large', Icon: true } },
    };
    const parsed = createCheckpointSchema.parse({
      asset_id: '00000000-0000-4000-8000-000000000000', branch_name: 'main', author: { figma_id: 'u', name: 'U' },
      snapshot_json: { figmaNodeId: 'n', figmaNodeName: 'n', capturedAt: 't', root },
    });
    const r = parsed.snapshot_json.root as typeof root;
    expect(r.fills[0].imageHash).toBe('h1');
    expect(r.fills[0].scaleMode).toBe('FILL');
    expect(r.strokes[0].visible).toBe(false);
    expect(r.effects[0].spread).toBe(4);
    expect(r.autoLayout).toEqual(root.autoLayout);
    expect(r.component).toEqual(root.component);
  });
});
```

- [ ] **Step 2 :** `cd backend && npx vitest run src/tests/api.schema.test.ts` → FAIL (champs supprimés par Zod).
- [ ] **Step 3 :** ajouter les champs aux schémas Zod (`figmaStrokeSchema.visible: z.boolean().optional()`, `figmaEffectSchema.spread: z.number().optional()`, `nodeSnapshotSchema.autoLayout: z.object({...}).optional()`, `component: z.object({ key: z.string(), name: z.string(), set: z.string().optional(), variant: z.record(z.string(), z.union([z.string(), z.boolean()])).optional() }).optional()`) et aux types des deux côtés (même forme que ci-dessus).
- [ ] **Step 4 :** vert + `npx tsc --noEmit` (backend et plugin).
- [ ] **Step 5 : commit** — `feat(diff): champs de capture des trous de détection (types + schéma)`.

---

## Task 2 : Diff des peintures — dégradés, images, contours

**Files :** Modify `backend/src/services/diff.service.ts` · Test `backend/src/tests/diff.service.test.ts`

**Interfaces — Produces :** `private comparePaints(changes, label: 'fill' | 'stroke', a: FigmaFill[] | FigmaStroke[], b: …)` utilisée **pour les remplissages et les contours**. Propriétés émises (préfixe `fill` ou `stroke`, indice `[i]` s'il y a plus d'une peinture — convention actuelle) :
- `<p>s` : nombre de peintures changé (`fills` existe déjà ; **nouveau** `strokes`) ;
- `<p>` / `<p>[i]` : couleur unie (existant) ou **type** changé (existant) ;
- `<p>.gradient` / `<p>[i].gradient` : étapes (position ± 0,01, couleur `colorsEqual`) ou angle (± 1°) changés — `oldValue`/`newValue` = liste des couleurs hex ; `delta` = « `#AA…, #BB…` → `#CC…, #DD…` » ;
- `<p>.image` : `imageHash` différent — `delta` = « image remplacée » ; `<p>.scaleMode` si différent ;
- `<p>.visible` : visibilité (existant pour les remplissages, **nouveau** pour les contours).
Le comparatif actuel « premier contour uni » est **remplacé** par `comparePaints('stroke', …)`.

- [ ] **Step 1 : tests qui échouent** (bloc `describe('trous de détection — peintures')`, avec le helper `makeSnapshot` du fichier) :
  1. dégradé linéaire dont une étape passe de `#FF0000` à `#00FF00` → une propriété `fill.gradient` ;
  2. même dégradé avec une position 0,300000001 vs 0,3 → **aucun** changement ;
  3. image `imageHash: 'a'` → `'b'` → `fill.image` avec `delta` « image remplacée » ;
  4. contour ajouté (`strokes: []` → un contour uni) → `strokes` (« 0 → 1 ») ;
  5. contour dont la couleur change **et** qui n'est pas le premier → `stroke[1]` ;
  6. contour masqué (`visible: true` → `false`) → `stroke.visible` ;
  7. snapshot ancien : contour sans `visible` d'un côté → **aucun** `stroke.visible`.
- [ ] **Step 2 :** `npx vitest run src/tests/diff.service.test.ts` → FAIL sur 1, 3, 4, 5, 6 (2 et 7 passent : ils protègent).
- [ ] **Step 3 :** extraire le bloc « Fills » de `compareNodes` dans `comparePaints` (comportement existant inchangé pour les remplissages unis), l'étendre aux dégradés, images et visibilité avec la règle « champ absent d'un côté → pas comparé », et remplacer le bloc « Strokes » par `this.comparePaints(changes, 'stroke', v1.strokes, v2.strokes)`.
- [ ] **Step 4 :** suite backend verte (les tests existants sur `fill`/`stroke` doivent passer **sans** modification d'attendu : si l'un change, c'est un ruling à consigner).
- [ ] **Step 5 : commit** — `fix(diff): dégradés, images et tous les contours comparés`.

---

## Task 3 : Diff des ombres, de l'auto-layout et des composants

**Files :** Modify `backend/src/services/diff.service.ts` · Test `backend/src/tests/diff.service.test.ts`

**Interfaces — Produces :** propriétés émises :
- `effect.type` / `effect[i].type` ; `effect.offset` (`delta` « (0, 2) → (0, 6) ») ; `effect.spread` (numérique, ε) ;
- `layoutMode` (direction : NONE / HORIZONTAL / VERTICAL / GRID) ;
- `itemSpacing`, `padding` (`delta` « 8/16/8/16 → 12/16/12/16 », ordre haut/droite/bas/gauche), `primaryAxisAlignItems`, `counterAxisAlignItems`, `layoutWrap` ;
- `component` (composant échangé : `oldValue`/`newValue` = noms) — **seulement si** les clés diffèrent **et** qu'on n'est pas dans le même jeu de variantes ;
- `variant.<Propriété>` (une par propriété de variante changée, ex. `variant.Size` « Large → Small »).

- [ ] **Step 1 : tests qui échouent** (`describe('trous de détection — ombres, auto-layout, composants')`) :
  1. ombre dont `offset` passe de `{0,2}` à `{0,6}` → `effect.offset` ;
  2. ombre `DROP_SHADOW` → `INNER_SHADOW` → `effect.type` ;
  3. `layoutMode` `HORIZONTAL` → `VERTICAL` → `layoutMode` ;
  4. `autoLayout.itemSpacing` 8 → 12 → `itemSpacing` (« +4.00px ») ;
  5. `paddingTop` 8 → 12 → **une** propriété `padding` ;
  6. instance `component.key` `k1` → `k2`, jeux différents → `component` (« Button → Tag ») ;
  7. même jeu `Button`, clés différentes, `variant.Size` `Large` → `Small` → **uniquement** `variant.Size` (pas de `component`) ;
  8. snapshot ancien (pas d'`autoLayout` ni de `component` d'un côté) → **aucun** changement.
- [ ] **Step 2 :** FAIL sur 1 à 7 (8 passe).
- [ ] **Step 3 :** implémenter dans `compareNodes` : ombres (après le bloc existant, à nombre égal), auto-layout (si `autoLayout` présent des deux côtés, et `layoutMode` si présent des deux côtés), composant (si `component` présent des deux côtés : variantes d'abord ; `component` seulement si `key` diffère et `set` absent ou différent).
- [ ] **Step 4 :** suite backend verte.
- [ ] **Step 5 : commit** — `fix(diff): ombres, auto-layout, composant et variante comparés`.

---

## Task 4 : Libellés lisibles et significativité

**Files :** Modify `backend/src/services/change-format.service.ts`, `backend/src/services/significance.service.ts` · Test `backend/src/tests/change-format.service.test.ts`, `backend/src/tests/significance.service.test.ts`

**Interfaces — Produces :** libellés (`formatChange`) — `fill.gradient` → `{ kind: 'text', label: 'Dégradé', from, to }` ; `fill.image` → `{ kind: 'generic', label: 'Image', detail: 'image remplacée' }` ; `strokes` / `stroke*` → `Contour` ; `effect*.offset` / `.type` / `.spread` → `Ombre` ; `layoutMode` → `Direction` ; `itemSpacing` → `Espacement` ; `padding` → `Marges intérieures` ; `primaryAxisAlignItems` / `counterAxisAlignItems` → `Alignement` ; `layoutWrap` → `Retour à la ligne` ; `component` → `Composant` ; `variant.X` → `Variante X`. Significativité : `itemSpacing: 1`, `effect.spread: 1` ajoutés à `SIGNIFICANCE_THRESHOLDS` ; `fill.gradient`, `fill.image`, `component`, `variant.*`, `layoutMode`, `padding` qualitatifs (toujours notables — la règle par défaut « propriété inconnue → notable » les couvre déjà, un test le fige).

- [ ] **Step 1 : tests qui échouent** — un test `formatChange` par libellé ci-dessus ; `scoreChange` : `itemSpacing` 8 → 8,5 → `minor`, 8 → 12 → `notable` ; `variant.Size` → `notable`.
- [ ] **Step 2 :** FAIL (libellés génériques, seuil absent).
- [ ] **Step 3 :** ajouter les cas à `formatChange` (préfixes : `startsWith('variant.')`, regex `^(fill|stroke)(\[\d+\])?\.gradient$`, etc.) et les seuils.
- [ ] **Step 4 :** suite backend verte.
- [ ] **Step 5 : commit** — `feat(diff): libellés et significativité des nouvelles propriétés`.

---

## Task 5 : Plugin — capture (module pur + passe des composants)

**Files :** Create `plugin/src/capture.ts`, `plugin/src/capture.test.ts` · Modify `plugin/src/main.ts`

**Interfaces — Produces :**
- `autoLayoutOf(n: AutoLayoutLike): NodeSnapshot['autoLayout']` — `undefined` si `layoutMode` absent ou `'NONE'`.
- `strokeOf(p: PaintLike): FigmaStroke` — ajoute `visible`.
- `spreadOf(e: EffectLike): number | undefined`.
- `variantOf(props: Record<string, { type: string; value: string | boolean }> | undefined): Record<string, string | boolean> | undefined` — garde `VARIANT` et `BOOLEAN`.
- `collectComponents(roots: readonly TreeLike[], getMain: (inst: TreeLike) => Promise<MainLike | null>): Promise<Map<string, { key: string; name: string; set?: string }>>` — parcourt les arbres (`TreeLike` = `{ id, type, children? }`), lit **en parallèle** le composant principal de chaque nœud `INSTANCE` (y compris imbriqué) ; la `Map` est indexée par **id d'instance**. Une instance dont la lecture échoue est ignorée (pas de `component`).
- `extractSnapshot` reçoit la `Map` (paramètre supplémentaire) et renseigne `component` (avec `variant` depuis `componentProperties`), `autoLayout`, contours et ombres enrichis. `handleSnapshot` appelle `collectComponents` **avant** l'extraction (après `adoptMovedIdentities`).

- [ ] **Step 1 : tests qui échouent** (faux nœuds structurels, comme `trackedFrames.test.ts`) : `autoLayoutOf` sur un faux cadre HORIZONTAL (valeurs recopiées) et sur NONE (`undefined`) ; `strokeOf` (visible) ; `spreadOf` ; `variantOf` (garde VARIANT/BOOLEAN, ignore TEXT/INSTANCE_SWAP) ; `collectComponents` sur un arbre avec 3 instances (dont une imbriquée dans une autre) → 3 entrées indexées par id d'instance, `set` = nom du parent `COMPONENT_SET` quand il existe, et une instance dont `getMain` rejette est simplement absente.
- [ ] **Step 2 :** `cd plugin && npx vitest run src/capture.test.ts` → FAIL (module absent).
- [ ] **Step 3 :** implémenter `capture.ts` ; brancher dans `main.ts` (`extractStrokes` → `strokeOf`, `extractEffects` → `spread`, `extractSnapshot` → `autoLayout` + `component`) ; `getMain` = `(inst) => (inst as InstanceNode).getMainComponentAsync()`, `set` = `main.parent?.type === 'COMPONENT_SET' ? main.parent.name : undefined`, `key` = `main.key`.
- [ ] **Step 4 :** vert + `npx tsc --noEmit`.
- [ ] **Step 5 : commit** — `feat(plugin): capture auto-layout, contours, ombres et composants`.

---

## Task 6 : Vérification finale et documentation

**Files :** `PIPELINE.md` (étape 2 : liste des propriétés comparées), `CHANGELOG.md` (`[Unreleased]`)

- [ ] **Step 1 :** suites backend et plugin vertes, typecheck OK, au-dessus de la baseline (288 / 180).
- [ ] **Step 2 : vérification manuelle Figma** (noter la durée de capture d'une page riche en icônes, avant/après) (backend local, `VITE_API_BASE=http://localhost:3001 npm run build`) : sur une frame suivie, changer une couleur de dégradé, remplacer une image, masquer un contour, décaler une ombre, changer l'espacement et la direction d'un auto-layout, changer la variante d'un bouton, échanger une icône → chaque changement apparaît avec son libellé français, et **aucun** faux changement sur une version capturée avant ce plan.
- [ ] **Step 3 :** `PIPELINE.md` : remplacer la liste « Propriétés comparées » par la liste complète ; CHANGELOG.
- [ ] **Step 4 : commit** — `docs(diff): propriétés comparées`.

---

## Hors périmètre

- **Restauration** de ces propriétés (auto-layout, variante, composant) : chantier restauration / Phase 4.
- Dégradés **angulaires et diamant** (étapes non capturées aujourd'hui) : même mécanisme, à ajouter si le besoin apparaît.
- Propriétés d'instance `TEXT` et `INSTANCE_SWAP` : le texte est déjà comparé sur les nœuds, l'échange est vu via `component` sur l'instance enfant.
- Styles et variables (`fillStyleId`, `boundVariables`) : prérequis du chantier design system, lot séparé.
