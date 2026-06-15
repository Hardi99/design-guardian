# Spec — Modèle métier unifié (identity-centric) pour Design Guardian

> Doc de cadrage **conceptuel** (pas d'implémentation ici). Définit la **base commune** dont toutes les features dérivent, pour remplacer l'approche improvisée actuelle. Validé en brainstorming le 2026-06-11.

---

## 1. Contexte & problème

Design Guardian est un « git pour le design » (plugin Figma). Chaque feature a aujourd'hui **improvisé sa propre notion d'identité de nœud**, ce qui rend le restore fragile et le merge **impossible** :

| Feature | Modèle d'identité **actuel** | Conséquence |
|---|---|---|
| Capture (check) | `node.id` Figma (volatile) | snapshot non corrélable cross-branche |
| Diff | `node.id` | corrélation fiable same-branche seulement |
| Branch | `clone()` → **nouveaux ids** | identité **perdue** dès la création de branche |
| Restore | id same-branche / **nom** cross-branche | match par nom = duplications / mauvais nœud (audit W2) |
| Attribution | `figma.currentUser` par checkpoint | pas d'attribution par élément |

**On n'était ni snapshot-centric ni canvas-centric : un hybride improvisé.** C'est la racine du malaise.

### Objectif
Poser **un seul modèle métier** (vocabulaire + source de vérité + opérations) auquel **toutes** les features se conforment. Arrêter l'impro.

---

## 2. Décision : modèle **identity-centric**

Le débat « snapshot vs canvas » est un faux dilemme :
- 100 % snapshot-centric → **matérialisation lossy** (l'API plugin Figma n'offre aucune sérialisation/désérialisation sans perte).
- 100 % canvas-centric → **pas d'identité** stable.

**La base commune : le `dg_id` est la colonne vertébrale.** Canvas et snapshots deviennent deux *vues* de la même identité, avec **trois rôles disjoints (zéro concurrence)** :

| Source de vérité de… | Détenue par |
|---|---|
| **Identité / correspondance** | `dg_id` (l'invariant) |
| **Contenu / état courant** (pleine fidélité) | le **canvas vivant** (nœuds Figma réels) |
| **Historique** (immuable) | les **snapshots** (Supabase) |

### Pourquoi garder les pages clonées (et non passer git-pur)
La duplication des nœuds est **le prix de la fidélité** : tant que le snapshot est une projection lossy, seuls les **nœuds réels vivants** garantissent la pleine fidélité cross-branche. Un modèle git-pur (branche = pointeur, re-matérialisation au switch) dégraderait le design à chaque switch et **concurrencerait l'historique natif *sans perte* de Figma** — combat perdu. On reste la **couche d'intelligence** au-dessus du design vivant.

> **Le défaut n'était pas la duplication — c'était la duplication qui *détruit l'identité*.** On garde la duplication, on répare l'identité.

---

## 3. Vocabulaire commun (entités)

- **Élément** = un nœud Figma + son `dg_id` stable. L'atome ; identité universelle partagée par toutes les features.
- **Snapshot** = valeur **immuable** : arbre `dg_id → propriétés` (le schéma actuel `NodeSnapshot`).
- **Checkpoint** (= « commit ») = snapshot + auteur (`figma.currentUser`) + `parent_id` → forme un **DAG**.
- **Branche** = une ligne d'historique, **matérialisée** en working tree (page `dg/…`) dont les nœuds **partagent les `dg_id`** de leur base.
- **Canvas** = projection **mutable** éditable (là où le designer travaille maintenant).
- **Delta** = `diff(snapshotA, snapshotB)`, keyé `dg_id` (added / removed / changed par propriété).
- **Auteur** = `figma.currentUser` (id/name/photo), stampé par checkpoint **et** par `dg_id` (dernier éditeur).

---

## 4. Chaque feature = une opération typée

Plus aucune feature n'invente son identité. Toutes parlent `dg_id`.

| Feature | Opération | Vit dans |
|---|---|---|
| **Capture** | `canvas → checkpoint` (stampe `dg_id`, lit props, stamp auteur/`dg_id`) | plugin (main) |
| **Diff** | `(snapshot, snapshot) → delta` (pur, keyé `dg_id`) | backend (Hono) |
| **Restore** | `(snapshot | delta) → canvas` (écrit par match `dg_id`) | plugin (main) |
| **Branch** | fork d'une ligne + working tree partageant les `dg_id` | plugin (main) |
| **Merge** | `(base, canvasA, canvasB) → canvas résolu` (3-way sur `dg_id`, copie réelle nœud→nœud, conflits → pick visuel) | **décision** backend · **application** plugin |
| **Attribution** | stamp auteur **par `dg_id`** à chaque capture | plugin (main) |
| **Gold / approbation** | statut d'un checkpoint | backend |

---

## 5. Mécanique du `dg_id`

### 5.1 Stockage
- `dg_id` = UUID v4, stocké via `setPluginData` (ou `setSharedPluginData` — voir 5.5) sous une **clé persistée gelée** (voir 5.5).
- À côté, on stocke **`owner_node_id`** = le `node.id` Figma au moment du stamp (pour détecter les copies — voir 5.4) et **`last_author`** (id designer).
- Budget : `pluginData` limité à **100 kB par entrée**, privé au plugin, encodage JSON. Nos quelques champs (~quelques centaines d'octets) sont **triviaux**. *(Fait vérifié — docs Figma `setPluginData`.)*

### 5.2 Minting (capture)
À la capture, on parcourt l'arbre : tout nœud **sans `dg_id`** en reçoit un neuf. Les nœuds **existants** (legacy) bootstrap `dg_id = node.id` à la première recapture.

### 5.3 Propagation à la création de branche
`handleCreateBranch` fait `node.clone()`. **Le comportement de `clone()` vis-à-vis du pluginData n'est PAS documenté** *(vérifié : page officielle `FrameNode.clone()` muette, sources secondaires contradictoires)*. **On ne parie donc pas dessus** : juste après `clone()`, l'arbre original et le clone sont **structurellement identiques** → un **parcours parallèle** original↔clone **recopie chaque `dg_id`** de façon déterministe. L'identité cross-branche devient **garantie**, indépendamment de Figma.

### 5.4 Détection de collision (copier-coller / Ctrl+D)
Une duplication utilisateur peut produire **deux nœuds avec le même `dg_id`**. Parade à la capture : si `owner_node_id ≠ node.id` courant **et** collision de `dg_id` détectée → c'est une copie → **re-mint** un `dg_id` neuf + maj `owner_node_id`.

### 5.5 Résilience au rebrand (le nom du plugin **va** changer)

Le produit sera renommé. La clé persistée doit **survivre** au rebrand, sinon on orpheline tous les stamps des fichiers utilisateurs.

- **Découplage obligatoire** entre le **nom commercial** et la **clé persistée** :
  - **Identifiant de code** (variable `dgId`, le concept) = cosmétique → renommable librement (pur refactor).
  - **Clé/namespace persisté** (la string écrite dans les fichiers Figma) = **constante gelée, brand-neutre**, définie à **un seul endroit**, **jamais modifiée**. ⚠️ Ne PAS la préfixer par la marque (éviter `dg_`).
- **Choisir maintenant** une string neutre et stable (ex. un codename interne figé), documentée comme « protocole d'identité — ne jamais renommer ».
- **Dette existante** : les clés actuelles `dg_file_id` / `dg_main_page_id` portent déjà le préfixe marque `dg_`. Au rebrand, **ne pas les renommer** (sinon perte) — ou les migrer explicitement. À traiter dans SP1.
- **Niveau de couplage à l'ID plugin** :
  - Changer le **nom d'affichage** du plugin = sans risque (`pluginData` est lié à l'**ID** plugin, pas au nom).
  - Republier sous un **nouvel ID** plugin = `pluginData` illisible → préférer **`setSharedPluginData(NAMESPACE_GELÉ, …)`** (lisible quel que soit l'ID) pour la résilience maximale. Trade-off : lisible par d'autres plugins, mais un UUID `dg_id` n'est pas sensible. *(Sémantique `setSharedPluginData` à confirmer en SP1.)*

### 5.6 Faits API porteurs (vérifiés)
- `pluginData` : 100 kB/entrée, privé au plugin, JSON, effaçable via `""`. ✅
- `clone()` : nouveau nœud (nouvel id) ; copie-pluginData **non documentée** → on propage nous-mêmes. ✅
- `node.id` : stable pour la vie d'un nœud, **ne diverge qu'au clone/duplicate**. ✅
- `figma.currentUser` : id/name/photo → identité designer (déjà utilisé). ✅

---

## 6. Architecture (où vit quoi)

| Couche | Responsabilité |
|---|---|
| **Plugin (main thread)** | tout ce qui touche `figma.*` : mint/stamp `dg_id`, propagation au clone, application restore/merge sur les nœuds réels, capture |
| **Plugin (UI thread)** | UI, appels HTTP backend |
| **Backend (Hono)** | logique **pure sur snapshots** : diff, **décision** de merge (3-way), persistance (Supabase), DAG (`parent_id`), AI Patch Note, paiements |

**Stack confirmée** : Hono / monolithe modulaire / Node sur Railway / TypeScript. Le travail `dg_id` est **côté plugin** ; le backend ne grossit pas. Rester en **TS de bout en bout** permet de **partager le modèle** (snapshot, diff, décision merge) entre plugin et backend — c'est le même principe anti-duplication que `dg_id`. La trajectoire de montée en charge (post-1000) est en **§11**.

**Division merge** : la **décision** 3-way vit côté backend (au même endroit que le diff, pour la cohérence) ; l'**application** (écriture des propriétés réelles) vit côté plugin (seul à avoir `figma.*`).

---

## 7. Cas limites & périmètre assumé (pas de magie)

**Couvert par le merge proto** (= props du schéma snapshot) : position, taille, fills, strokes, effects, texte (contenu/taille/police), visibilité, opacité, corner radius, rotation, vectorPaths, et **add/remove/reorder** d'enfants.

**Hors périmètre proto (punt explicite)** :
- Intérieur des **instances de composants** (overrides) — `clone()` joue avec les masters (doc ambiguë).
- **Variables/tokens**, **prototyping**, **contraintes**, **masques**, **booleans** — non capturés au snapshot.
- **Position en auto-layout** : calculée, non assignable → on réconcilie l'**ordre**, pas le x/y (le restore le gère déjà).
- **Rich text (style par plage)** — LIMITE CONNUE (constatée en test le 2026-06-14) : le snapshot capture le style texte au niveau **nœud** (une couleur, une police). Le texte Figma multi-couleur / multi-police (style par *plage de caractères*) tombe à `figma.mixed` → **non capturé → non restauré** (le contenu, espaces/newlines inclus, l'est). Vrai fix = capturer/restaurer par segment (`getStyledTextSegments` + `setRange*`) → **projet « fidélité rich-text » dédié**, post-SP1. Un garde-fou charge déjà toutes les polices du nœud avant mutation (évite le throw « unloaded font »).

**Classes de conflit (merge)** : `changed/changed` (même prop, valeurs différentes), `deleted/modified`, `moved/moved` (reparent divergent). Résolution **manuelle visuelle**.

---

## 8. Mapping de l'audit restore (W1–W7)

| Finding audit | Sort sous le nouveau modèle |
|---|---|
| **W2** match par nom cross-branche | **résolu** par match `dg_id` |
| **W5** matching enfants O(n²) | **résolu** par `Map<dg_id, node>` |
| **W7** logique d'application non testée | **amélioré** : matching + table 3-way deviennent **purs → testables** |
| **W1** fills/strokes non vidables | à **corriger** pendant le re-câblage restore (réassigner même vide) |
| **W3** `atob()` corrompt l'UTF-8 | à **corriger** (décodage base64→UTF-8) |
| **W4** texte multi-police écrasé | à **corriger** (garde-fou `figma.mixed`) |
| **W6** échecs par nœud silencieux | à **corriger** (`console.warn` + remontée) |

---

## 9. Plan de migration

1. **Bootstrap** : à la première recapture d'un asset existant, stamper `dg_id = node.id` sur chaque nœud, + `owner_node_id`.
2. **Fallback legacy** : tant qu'un nœud n'a pas de `dg_id`, restore/diff retombent sur l'appariement par **chemin structurel + nom/type** (le bricolage actuel, isolé et temporaire).
3. **Période double-chemin** assumée le temps que le parc soit stampé ; suppression du fallback une fois la migration vérifiée.
4. Aucune migration SQL bloquante : `dg_id` voyage **dans le snapshot JSON** (le schéma Zod gagne un champ `dg_id` optionnel d'abord, requis ensuite).

---

## 10. Découpage en sous-projets

Chacun aura son propre cycle spec → plan → implémentation.

- **SP1 — Fondation identité** *(no-regret, à faire en premier)* : capture stampe `dg_id` (+ owner/author), branch propage (parcours parallèle), restore re-câblé sur `dg_id` (+ corrige W1/W3/W4/W6), diff re-keyé. Tests purs sur le matching.
- **SP2 — Moteur de merge** *(bâti sur SP1)* : décision 3-way (backend), application nœud→nœud (plugin), détection + UI de résolution de conflits.

> **Décision « pages vivantes (3) vs snapshot-centric (B) » différée à SP2.** `dg_id` est requis par les deux → la fondation est **sans regret**. On tranchera avec le socle en place et plus d'expérience.

---

## 11. Annexe — Trajectoire de montée en charge (post-1000, matériau BC04)

Cible réaliste court terme : **~1000 users** (~0,01 capture/s) → une **seule instance Hono** suffit largement (étape 0). Principe invariant : **on découpe pour des raisons concrètes (async, isolation, équipe, kernel CPU chaud), pas pour “du scale”**. Le monolithe modulaire **préserve l'option** d'extraire un service le long des coutures existantes, sans rewrite.

| Étape | Déclencheur | Action |
|---|---|---|
| 0 (aujourd'hui → 1000) | — | monolithe Hono, 1 instance Railway |
| 1 | croissance | scale horizontal (N instances + LB), **queue** pour l'IA, PgBouncer |
| 2 | charge lourde | read replicas, Redis, CDN assets, autoscaling, rate-limit |
| 3 | extrême (≫ 1M) | extraire worker IA / **kernel calcul** (Go/Rust possible, via contrat) / isolation paiements / sharding |

**Polyglotte uniquement** à un **kernel CPU chaud prouvé par profilage**, avec modèle partagé via contrat — jamais « chaque service sa langue » par défaut (anti-pattern : ops + duplication).

---

## 12. Points à vérifier avant SP1

- **Test empirique `clone()`+pluginData** (2 min dans le plugin : stamp → clone → relire). On propage de toute façon nous-mêmes, mais le résultat dit si la propagation explicite est *nécessaire* ou *redondante*.
- Confirmer le **coût perf** d'un `setPluginData`/nœud à la capture sur un gros frame (O(n) écritures).
- Décider le **format du champ `dg_id`** dans le schéma Zod (optionnel → requis).
- **Geler la clé/namespace persisté** : choisir une string **brand-neutre** maintenant (cf. 5.5), à un seul endroit, marquée « ne jamais renommer ».
- **Confirmer la sémantique `setSharedPluginData`** (lisibilité quel que soit l'ID plugin) → décide `setPluginData` vs `setSharedPluginData` pour la résilience au rebrand.
- Décider le sort des clés legacy `dg_file_id` / `dg_main_page_id` (garder telles quelles vs migrer) au rebrand.

---

## Non-goals (ce spec ne fait PAS)

- N'implémente rien (cadrage conceptuel).
- Ne tranche pas 3-vs-B (différé à SP2).
- Ne couvre pas le merge des instances de composants / variables / prototyping.
- Ne construit pas la trajectoire de scaling (annexe documentaire seulement).
