# Mode d'emploi — Design Guardian (plugin Figma)

> « Git pour le design ». Ce doc décrit **comment utiliser** chaque commande et **le comportement attendu** — utile comme guide d'onboarding ET comme check-list de test.

---

## Concepts clés

- **Élément suivi** = un nœud Figma porteur d'un **`dg_id`** (identité stable, invisible, stockée dans le `pluginData`). Stampé automatiquement à la première capture. Survit aux branches et au renommage du produit.
- **Checkpoint** (= `git commit`) = un instantané (snapshot) d'un élément à un instant T, avec auteur + date + résumé IA.
- **Branche** (= `git branch`) = une **page Figma** nommée `dg/<nom>` contenant une copie de l'élément, dont les nœuds **partagent les `dg_id`** de l'original.

---

## 1. Capturer un checkpoint (= commit)

**Comment :** sélectionne **un seul** frame/élément → bouton **Capturer**.

**Comportement attendu :**
- ✅ Un checkpoint apparaît dans l'historique (auteur = toi via `figma.currentUser`, horodaté).
- ✅ L'élément reçoit (silencieusement) un `dg_id` s'il n'en a pas. Re-capturer le **même** élément → **même `dg_id`** (stable).
- ✅ Le **résumé IA** (AI Patch Note) s'affiche « en cours » puis se remplit après quelques secondes (génération **asynchrone** : la capture ne bloque pas).
- ❌ Si 0 ou plusieurs éléments sélectionnés → message d'erreur (« Sélectionne un seul élément »).

---

## 2. Créer une branche (= branch)

**Comment :** sélectionne le frame → saisis un nom → **Créer la branche**.

**Comportement attendu :**
- ✅ Une **nouvelle page** `dg/<nom>` apparaît dans le **panneau Pages** (en haut à gauche de Figma), pas une frame sur le canvas courant.
- ✅ Elle contient une **copie** du frame sélectionné.
- ✅ En coulisses : chaque nœud copié **hérite du `dg_id`** de son homologue (corrélation cross-branche). C'est ce qui rendra le restore et (plus tard) le merge possibles entre branches.
- ℹ️ Si une branche du même nom existe déjà → bascule dessus (n'en recrée pas).

## 3. Changer de branche (= checkout)

**Comment :** sélectionne la branche (ou « main »).

**Comportement attendu :** la page active devient `dg/<nom>` (ou la page principale pour « main »). Tu édites alors **cette** copie.

---

## 4. Restaurer un checkpoint (= restore / checkout d'une version)

C'est ici que l'identité `dg_id` paie. **Deux cas**, gérés automatiquement :

### 4a. Restore **same-branch** (l'élément est sur la page courante)
**Comportement attendu :**
- ✅ Restauration **« live-diff »** : seules les propriétés **réellement modifiées** sont réécrites (un nœud inchangé est sauté).
- ✅ L'élément est **modifié sur place** (reste éditable, natif).
- ✅ **Annulable** d'un seul Ctrl+Z.
- ℹ️ La **position/taille de la racine** n'est PAS touchée (on ne déplace/redimensionne pas le frame suivi) ; les **enfants**, eux, retrouvent leur position dans le frame.

### 4b. Restore **cross-branch** (tu es sur une autre branche)  ⭐ NOUVEAU
**Comportement attendu :**
- ✅ Le plugin retrouve l'élément homologue sur la page courante **par `dg_id`** (partagé à la création de branche) et fait un **vrai restore de propriétés** dessus — **éditable, pleine fidélité**, exactement comme en same-branch.
- ✅ Donc : capture sur `main` → va sur `dg/test` → restore ce checkpoint → **le nœud de la branche est modifié en place** (et **non** un nouveau nœud SVG collé).
- ⚠️ **Dernier recours** : si aucun nœud homologue n'existe sur la page courante (ex. élément jamais branché), le plugin **reconstruit depuis le SVG** capturé (visuel fidèle mais **non éditable** — vectorisé). C'est volontairement le fallback, plus le comportement par défaut.

> 🔎 **Diagnostic :** ouvre **Plugins → Development → Open Console**. En cas de souci, le restore logge `[DG] restore: nœud sauté <id> <type> <erreur>`.

---

## 5. Diff viewer

**Comportement attendu :** comparaison de deux versions en **Split** / **Overlay** (mode différence) / **Nodes** (liste des changements, propriété par propriété, tolérance 0,01px).

## 6. Statut « Gold » (approbation)

**Comportement attendu :** un checkpoint peut passer `draft → review → approved`. Sert de version de référence validée.

---

## ⚠️ Limites connues (à NE PAS confondre avec des bugs)

| Cas | Comportement actuel | Statut |
|---|---|---|
| **Texte multi-couleur / multi-police** (style par plage) | le **contenu** (texte, espaces, retours ligne) se restaure ; le **style par plage** non (snapshot = 1 couleur / 1 police au niveau nœud) | limite connue → projet « fidélité rich-text » |
| **Vider** un fill/stroke (le supprimer) | un fill **ajouté** se restaure ; un fill **supprimé** n'est pas re-vidé au restore | W1, à corriger |
| Restore cross-branche **sans** nœud homologue | fallback SVG **non éditable** (vectorisé), apparié par nom | par conception (dernier recours) |
| Gradient / effets | angle/radius restaurés ; détails fins (handles de gradient, spread d'ombre) approximés | pertes mineures `by design` |

---

## ✅ Check-list de test rapide

1. **Capture** : sélectionne un frame → capture → checkpoint + résumé IA qui se remplit. Re-capture → même `dg_id` (stable).
2. **Branche** : crée `dg/test` → vérifie la **nouvelle page** dans le panneau Pages, avec la copie.
3. **Restore same-branch** : modifie le frame → restore le checkpoint → revient à l'état capturé, éditable, Ctrl+Z annule.
4. **Restore cross-branch ⭐** : capture sur `main` → va sur `dg/test` → modifie la copie → restore le checkpoint de `main` → le nœud de la branche est **modifié en place** (pas un SVG figé).
5. **Texte** : un texte **uni** se restaure (contenu + couleur + police) ; un texte **multi-police** restaure le contenu mais pas le style par plage (limite connue).
