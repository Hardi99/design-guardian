# Spec — Restore lossless par `node.clone()`

> Nouveau restore : **emprunter le moteur de copie de Figma** au lieu de reconstruire les propriétés. Cf. `2026-06-18-super-restore-roadmap.md` (direction C). Décisions de brainstorm actées (2026-06-20).

---

## 0. Cadrage (rappel)

- Le restore **n'est pas le moat** (terrain de Figma natif) — objectif : **fiable** (pas parfait), sans réimplémenter Figma.
- `clone()` est **lossless** (variables, styles, instances, vector networks, auto-layout, prototyping préservés par Figma) → **zéro reconstruction**.
- Modèle à **deux représentations** : **JSON snapshot** (cloud → diff/changelog/attribution, inchangé) + **clone in-file** (nouveau → restore lossless).

## 1. Décisions actées (brainstorm)

1. **Clone = PRIMAIRE, reconstruction actuelle = FALLBACK.** On n'investit pas dans le lourd « épouse le moteur » (reconstruction auto-layout) : le clone le rend inutile là où un clone existe.
2. **Élagage : N derniers clones par asset** (v1 : `N = 5`). Au-delà → repli. L'historique complet reste en JSON cloud ; on ne perd que le *lossless* des vieux.
3. **Stockage : une page dédiée `dg/_history`** (cohérente avec les pages `dg/<branche>` existantes), un frame-clone par checkpoint.

## 2. Composants

### 2.1 Helpers purs (testables, TDD) — `plugin/src/restoreClone.ts`
- `pickHistoryClone(frames, versionId)` : parmi des descripteurs `{ id, versionId, assetId }`, renvoie l'id du clone correspondant au `versionId` (ou `undefined`).
- `framesToPrune(frames, assetId, keepN)` : renvoie les ids des clones de cet asset **au-delà des N plus récents** (les plus anciens), à supprimer. Tri par `versionNumber` décroissant.

### 2.2 History store (main thread) — `plugin/src/main.ts`
À chaque checkpoint **sauvé avec succès** :
1. Cloner le nœud capturé → l'`appendChild` sur la page `dg/_history` (créée si absente).
2. Tagger le clone en `pluginData` : `dg_history_version` (= version id), `dg_history_asset` (= dg_id de l'asset), `dg_history_vnum` (= numéro de version, pour le tri d'élagage).
3. `clone.locked = true` (anti-édition accidentelle).
4. Élaguer : supprimer les clones de cet asset au-delà des **N derniers** (`framesToPrune`).

### 2.3 Restore par clone (main thread) — `plugin/src/main.ts`
Pour un `versionId` cible :
1. Chercher le clone d'historique (`pickHistoryClone` sur les frames de `dg/_history`).
2. **Trouvé** → cloner CE clone, le placer là où est le nœud live (match `dg_id`/`id`), retirer l'ancien nœud, `propagateIdentity` (garder le dg_id), `unlock`, sélectionner + zoom.
3. **Absent** → **repli** sur `handleRestoreToFigma` actuel (propriétés/SVG).

## 3. Flux de données

**Capture :**
```
extractSnapshot (JSON) + clone immédiat du nœud → dg/_history (état exact figé)
  → POST checkpoint → version id
  → tag du clone (version id, asset, vnum) ; si POST échoue → supprimer le clone
  → framesToPrune → supprimer les vieux
```
*(Le clone est créé **immédiatement** à la capture pour figer l'état exact ; on le tag seulement quand le POST réussit. Le main thread reçoit le version id via un message UI→main, ex. `STORE_HISTORY_CLONE`.)*

**Restore :**
```
UI → RESTORE_TO_FIGMA(versionId, snapshot, svg) → main
  → pickHistoryClone → clone-back + remplace (lossless)
  → sinon repli handleRestoreToFigma(snapshot, svg)
```

## 4. Erreurs / fallback / rétro-compat

- **Pas de clone** (checkpoint ancien, élagué, ou supprimé par l'utilisateur) → **repli** sur le restore actuel → **zéro régression**.
- Clone **locké** ; s'il est supprimé manuellement → repli.
- **Bord connu** : cloner une instance dont le composant a été supprimé = dégradé (rare, Figma).
- Viewer read-only / `setPluginData` qui throw → try/catch (comme l'existant).

## 5. Tests

- **Purs (TDD)** — `plugin/src/restoreClone.test.ts` : `pickHistoryClone` (match / absent), `framesToPrune` (garde N récents, renvoie les plus vieux, tri par vnum, asset filtré).
- **Glue Figma** (clone / append / tag / lock / prune / replace) : typecheck + vérif manuelle (pas de mock Figma dans le repo).

## 6. Périmètre v1

- Restore lossless **même-fichier** + élagage N derniers + **repli**.
- **Cross-branche lossless** : vient quasi gratuitement (cloner inter-pages marche déjà — `handleCreateBranch` le prouve) ; à **confirmer en test manuel**, pas un objectif dur v1.

## 7. Hors périmètre / non-goals

- Pas de reconstruction auto-layout « épouse le moteur » (le clone la rend inutile).
- Le backend **n'a jamais** la copie lossless (le clone vit dans le `.fig`) — le restore se fait **dans Figma**, c'est OK.
- Pas de compression / dédup des clones en v1 (élagage N suffit).
- Pas de capture de padding/gap pour le changelog (chantier séparé, cf. roadmap).

## 8. Coûts assumés
Poids `.fig` **borné par N** · page `dg/_history` **visible** (cohérent `dg/`) · lossless **même-fichier** uniquement.
