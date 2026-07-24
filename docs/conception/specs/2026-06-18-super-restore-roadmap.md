# « Super restore » — Architecture & roadmap

> Synthèse de l'investigation restore (sessions 2026-06-17/18). **Cadrage stratégique d'abord, options techniques ensuite.** À relire avant tout chantier restore.

---

## 0. Cadrage stratégique (à ne jamais perdre de vue)

- **Le restore n'est PAS le moat.** Un restore lossless = exactement ce que **Figma natif** fait déjà (version history, ils possèdent le format interne). Combattre Figma sur le restore = terrain perdu.
- **Le moat = le changelog intelligent** (compréhension du changement). Diff + attribution = ses enablers. Restore = **délice / table-stakes**, pas différenciateur.
- **moat ≠ valeur** : le restore-en-contexte (revenir après avoir *compris* via le changelog) **plaît** (rétention, « 100 % avis positifs à chaud ») mais **n'érige pas** de mur (copiable). Le dimensionner comme un investissement **délice/fiabilité**, pas comme un investissement moat.
- **Seule vraie nuance du restore vs Figma** : granularité **élément** (revenir UN élément à un checkpoint sans toucher au reste) vs Figma = **fichier entier, tout-ou-rien**. Valeur d'usage réelle, mais pas un moat.
- **Règle d'or** : fiable, pas parfait-à-tout-prix. Ne pas y couler des semaines.

---

## 1. État actuel du restore

**Approche actuelle = reconstruction par propriétés** (mutation in-place + fallback SVG cross-branche).

| Marche | Échoue |
|---|---|
| structure, texte, contenu, fills (designs simples) | **géométrie des enfants auto-layout** (on force x/y/w/h → le moteur recalcule et écrase) |
| same-branch (match `node.id`) | rich text par plage (style multi-couleur/police) |
| cross-branch réel via `dg_id` (W2) | gradients (angle seul, transform approximé) |
| instances **sautées** (✅ fix 2026-06-18 : on ne descend plus dans les enfants d'instance — verrouillés par Figma, ils suivent la transform de l'instance) | nœuds supprimés (recréation nécessaire = lossy) |
| filet UI : `✓ N restauré(s) · M ignoré(s)` (anti-corruption silencieuse) | |

**Limite de fond** : forcer la géométrie propriété-par-propriété **se bat contre** le moteur Figma (auto-layout, instances). Long tail.

---

## 2. Les trois approches (comparées)

### A. Actuelle — forcer la géométrie
On set x/y/w/h absolus partout. ❌ se bat contre auto-layout/instances. C'est ce qui échoue sur le logo.

### B. « A2 » — faire équipe avec le moteur
Restaurer les **entrées** de layout (`layoutMode`, padding, gap, alignements, `layoutSizing*`, `layoutGrow`, `layoutPositioning`, ordre) et **laisser Figma recalculer** la géométrie. Géométrie absolue **seulement** hors auto-layout.
- ✅ le bon modèle (travaille AVEC le moteur) ; gère auto-layout imbriqué, wrap, position absolue.
- ✅ **bonus moat** : les mêmes données rendent le **changelog** propre — au lieu de « 30 positions décalées », dire « padding 16→24 » (la **cause**). Voir §5.
- Coût : **~3-6 j** (capture du modèle complet + ordre de ré-application). Borné mais réel.
- **Verdict : différer** (lancer si les beta réclament le restore auto-layout). N'est pas le moat.

### C. `node.clone()` — EMPRUNTER le moteur de Figma ⭐ (direction recommandée)
**Ne pas sérialiser/reconstruire. Stocker le vrai nœud cloné** (Figma clone *sans perte* : variables, styles, instances, vector networks, prototyping, auto-layout — c'est SA logique, pas la nôtre).
```
Checkpoint : node.clone() → page cachée "dg/_history/<assetId>/v<n>" (+ JSON pour le diff/changelog)
Restore    : re-cloner le nœud stocké → remplacer l'actuel. Lossless, ZÉRO réimplémentation.
```
- ✅ **Lossless ~100 %** en même-fichier → règle la peur du « restore à 90 % qui déçoit ».
- ✅ Remplacer par une **copie pristine** → le problème auto-layout/instances **disparaît** (la copie EST l'état correct, rien à recalculer).
- ✅ Cross-branche lossless (clone inter-pages) — mieux que le SVG actuel.
- **Coûts/limites honnêtes** :
  1. **Poids du `.fig`** : chaque checkpoint = un clone caché → fichier grossit. Mitigation : garder seulement les **N derniers** clones en fichier ; l'historique complet reste en JSON cloud (restore lossless garanti sur récents, best-effort au-delà).
  2. **Lié au fichier** : le clone vit dans le `.fig`, pas dans le cloud (le backend n'aura jamais la copie lossless). OK pour un plugin (restore se fait DANS Figma).
  3. **Références/prototyping pointant dans le frame** : remplacer change l'id → remapper par `dg_id` (rare).
  4. **Bord** : cloner une instance dont le composant a été supprimé = dégradé.
- **Verdict : LA direction restore** (emprunter > réimplémenter). Nécessite un brainstorm dédié avant code (pages cachées, pruning, sync clone↔snapshot).

> **`node.clone()` était déjà utilisé pour les branches** (`handleCreateBranch`) — mais mal exploité (l'identité `dg_id` était jetée, corrigé en SP1). L'étendre au **stockage de checkpoints** est l'évolution naturelle.

---

## 3. Catégories « réputées impossibles » — RÉÉVALUATION honnête

J'avais dit « hors d'atteinte » trop vite. En réalité, **4/5 sont atteignables** (durs, pas impossibles) via l'API :

| Catégorie | Verdict | Mécanisme API |
|---|---|---|
| **Overrides d'instances** | 🟠 possible (sous-ensemble overridable) | `instance.overrides`, `setProperties()`, `swapComponent()`, set `characters`/fills/visibilité. (Structurel interne = non, mais inutile : suit l'instance.) |
| **Variables / styles** | 🟢 possible | capturer `fillStyleId`/`textStyleId`/`boundVariables` + re-bind ; fallback valeur brute si supprimé |
| **Vector networks** | 🟢 possible | `vectorNetwork` (read) + `setVectorNetworkAsync` |
| **Prototyping** | 🟢 possible | `reactions` + `setReactionsAsync` ; cibles remappées par `dg_id` |
| **Cross-branch / nœuds supprimés** | 🔴 partiellement muré | matching = `dg_id` (résolu) ; recréation = lossy |

### Les SEULS vrais murs (irréductibles)
1. Internes **structurels** d'instance (x/y/taille) — *cannot be overridden* (mais inutiles, suivent l'instance).
2. **Ressource référencée supprimée** (composant/style/variable effacé → id perdu) → fallback valeur brute.
3. **Octets d'image** absents du fichier.
4. **Id d'origine** d'un nœud recréé (→ `dg_id` le remplace).

### La vraie nature du « graal »
Restaurer **tous** les designs parfaitement = **réimplémenter le modèle de données entier de Figma** (atteignable asymptotiquement, à coût exponentiel et croissant, + ces 4 murs). **Pas « impossible » — mais hors-proportion et hors-moat.**

> **L'insight `clone()` rend tout ça MOOT pour le restore same-fichier** : avec le clone, on n'a **rien** à capturer/réimplémenter de la §3 — Figma préserve tout. Les catégories §3 ne comptent que pour (a) la fidélité du **JSON snapshot** (→ diff/changelog) et (b) la recréation cross-fichier/cloud, pas pour le restore via clone.

---

## 4. Roadmap restore

| Étape | Statut |
|---|---|
| Instances sautées + filet anti-corruption | ✅ fait (2026-06-18) |
| Matching `dg_id` / cross-branche réel (W2) / UTF-8 (W3) | ✅ fait (SP1) |
| **Restore lossless via `node.clone()`** (direction C) | 🔜 brainstorm dédié quand priorisé |
| **A2-capture pour le changelog** (cf. §5) — petit, nourrit le moat | 🟡 à intégrer au chantier changelog |
| A2-restore complet (entrées auto-layout appliquées) | ⏸️ différé jusqu'à demande beta |
| Rich-text par plage, gradients exacts | ⏸️ différé |

---

## 5. Le SEUL morceau « A2 » rentable maintenant : pour le CHANGELOG

Pour le changelog (le moat), pas besoin de la machinerie restore. Il faut juste :
1. **Capturer `layoutPositioning`** (on capture déjà `layoutSizing`) — quelques lignes, côté capture.
2. **Une règle de significativité** : un delta x/y/w/h sur un **enfant de flux auto-layout** = **dérivé → mineur/groupé** (sauf si son mode de sizing change).

→ Transforme « 30 positions décalées » en « padding 16→24 → le panneau s'est recomposé » (**cause** vs conséquences). Pur classement, testable, **nourrit directement le moat**. À intégrer dans `scoreChange`/`rankDelta` (déjà construits, branche `feat/changelog-significance`).

---

## 6. Non-goals (restore)
- Ne PAS viser le restore parfait pour tout design (terrain Figma, hors-moat).
- Ne PAS réimplémenter le modèle Figma (variables/styles/vector/prototyping) côté restore tant que `clone()` couvre le besoin same-fichier.
- Ne PAS survendre le restore comme différenciateur — c'est un délice, pas un moat.
