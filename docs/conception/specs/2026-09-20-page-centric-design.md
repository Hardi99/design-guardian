# Page-centric — capturer la page entière

> **Statut** : design validé (brainstorm du 2026-09-20). Implémentation **conditionnée au spike de mesure** (§10).
> **Hors périmètre explicite** : le décommissionnement des branches (lot séparé, cf. §9).

---

## 1. Problème

Aujourd'hui une capture exige **une sélection d'un seul calque** (`main.ts:522-524`) et ne suit que le sous-arbre de ce nœud. Tout ce qui est hors de la frame trackée est **invisible au versioning** : le diff ment par omission.

**Le moteur du changement est la COUVERTURE** : qu'aucun calque de la page n'échappe au suivi. Ce n'est ni le confort de sélection, ni l'envie d'une vue « page entière » — ces deux-là sont au mieux des effets de bord.

## 2. Décisions actées

| # | Décision | Conséquence |
|---|---|---|
| D1 | L'unité devient la **page** : 1 page Figma = 1 asset = 1 timeline | Une capture couvre tous les calques de la page |
| D2 | **Remplacement net** du mode frame | Les assets frame existants passent en **lecture seule** (consultables et restaurables, plus alimentés) |
| D3 | Capture page, **lecture par viewport** | Le rendu reste au niveau d'un enfant de premier niveau, qui a une vraie géométrie |
| D4 | Navigation par **arbre de calques complet** | Replié par défaut, auto-déplié sur les chemins modifiés |
| D5 | Arbre servi **à la demande** par un endpoint dédié | Zéro poids ajouté à chaque version |
| D6 | **Invariant : cliquable ⟺ modifié** | Suppression du repli SVG reconstruit dans ce mode ; un viewport modifié a un rendu dans le cas nominal (cf. plafond §5) |

## 3. Modèle : racine synthétique et viewports

Aujourd'hui `snapshot.root` confond deux rôles : **conteneur** de l'arbre et **repère géométrique** (toutes les bbox lui sont relatives, `frame` = ses dimensions). Le page-centric les sépare.

**Racine synthétique.** `PageNode` étend `BaseNodeMixin`, `ChildrenMixin`, `ExportMixin`, `ExplicitVariableModesMixin` et `MeasurementsMixin` — **pas** `LayoutMixin`. Elle n'a donc ni `absoluteTransform`, ni `x/y/width/height`, ni `absoluteBoundingBox`. Elle porte l'arbre, avec une géométrie **neutre** :

```ts
{
  id: page.id, name: page.name, type: 'PAGE',
  x: 0, y: 0, width: 0, height: 0,   // jamais utilisée comme repère
  opacity: 1, fills: [], strokes: [],
  children: page.children.map(extractSnapshot),
}
```

> **La racine synthétique est un conteneur, pas un objet de design : elle est exclue du diff ET du restore.** Sans cette exclusion, toute géométrie qu'on lui donnerait (p. ex. l'union des calques) changerait dès qu'un calque bouge loin, et chaque capture afficherait un faux « la page a été redimensionnée ».

**Viewport.** Tout **enfant de premier niveau de la page** : une frame, mais aussi un vecteur ou un texte posé directement sur la page. Chacun a une géométrie Figma réelle. C'est **le nouveau repère** :

- la `bbox` d'un calque est relative à **son viewport** (plus à la racine) ;
- `frame` = les dimensions **du viewport** ;
- un enfant de premier niveau **est son propre viewport** : sa bbox vaut donc `{x:0, y:0, w, h}`.

```
viewportOf(node) = son ancêtre de premier niveau sous la page
                   (ou lui-même s'il EST de premier niveau)
```

Même forme de solution que `instanceRootMap` livrée en #71 (nœud → son INSTANCE la plus haute) : un parcours d'arbre qui propage un ancêtre. Cohérent avec la base de code, testable pareil.

**Conséquence** : le pipeline actuel (rendu, crops, surlignages, regroupement d'icônes, dérivés) fonctionne **sans modification**, appliqué *par viewport* au lieu de *par frame trackée*. On ne réécrit pas le diff ; on change ce à quoi il est relatif.

Il n'y a **pas** de catégorie « hors cadre » : un calque libre *est* son propre viewport, au même titre qu'une frame. Pas de cas particulier.

## 4. Capture

`handleSnapshot()` ne demande plus de sélection : il prend `figma.currentPage`.

1. **Garde** : refuser les pages techniques — nom commençant par `dg/` (branches et `dg/_history`). Le préfixe `dg/` est réservé et documenté.
2. `await ensurePagesLoaded()` (déjà en place, requis par dynamic-page).
3. Construire la racine synthétique (§3) avec `page.children.map(extractSnapshot)`.
4. `FigmaSnapshot.figmaNodeId` = `page.id`, `figmaNodeName` = `page.name`.

`extractSnapshot` reste **inchangée** : elle prend un `SceneNode` et les enfants de la page en sont. Seule la racine est construite à la main.

## 5. Rendus

Les rendus sont produits dans le plugin (`exportAsync`), mais **savoir quels viewports ont changé n'est connu qu'après le diff serveur**. D'où ce flux, qui prolonge le découplage rendu/POST fait en #67 :

```
1. Plugin  : capture le snapshot (aucun rendu)          → POST
2. Backend : diffe, stocke, répond avec la liste des
             viewports MODIFIÉS
3. Plugin  : exporte SEULEMENT ces viewports-là         → upload
```

- **Plafond** : `MAX_VIEWPORT_RENDERS` (proposé : 20) par capture, paramètre à ajuster.
- **Première version** (pas de parent, donc « rien n'a changé ») : rendre les viewports jusqu'au plafond, sinon la v1 n'aurait aucun visuel.
- **Clé de stockage** : `<storage_path sans .json>_render_<viewportId>.png`. L'ancienne clé `_render.png` reste lue pour les versions frame (lecture seule) → compat préservée.
- **Dégradation honnête** : si le rendu d'un viewport modifié manque (upload échoué), la ligne reste cliquable et le viewer affiche « Rendu indisponible. » (message déjà présent dans `ui.tsx`). On ne fabrique pas un visuel approximatif à la place.

## 6. Données

### 6.1 Ajouts au `DeltaJSON` (calculés à la capture, stockés)

Motif déjà en place pour `bbox`, `significance` et `instanceRoot` — le GET n'a ainsi **aucun snapshot à retélécharger** (gain perf existant préservé).

```ts
// par nœud
viewport?: string           // id de son ancêtre de premier niveau
bbox?:     { x,y,w,h }      // DÉSORMAIS relative au viewport, plus à la racine

// au niveau du delta
viewports?: Array<{ id: string; name: string; frame: { w:number; h:number }; changes: number }>
```

`changes` compte les **groupes** au sens de #71 (les nœuds internes d'une même icône comptent pour 1), pas les nœuds bruts — sinon le compteur de l'arbre contredirait celui du viewer.

`nodeBboxRelative` prend une origine explicite (le viewport) au lieu de toujours `snapshot.root`.

### 6.2 Endpoint arbre (nouveau)

```
GET /api/versions/versions/:id/layers
→ { layers: Array<{ id, name, type, children: [...] }> }
```

Le serveur télécharge le snapshot (colocalisé avec le Storage en EU, rapide), le **réduit au squelette** (`id`, `name`, `type`, enfants — sans fills, vectorPaths, effects…) et le renvoie. ~80 octets par calque au lieu du nœud complet.

**Pourquoi un endpoint plutôt que le stockage dans `analysis_json`** : l'arbre complet (~65 Ko pour 800 calques) serait dupliqué à chaque version alors qu'il bouge à peine — ~6,5 Mo pour 100 versions d'un arbre quasi identique. À la demande, le poids par version reste **nul** et les chemins critiques (timeline, résumé IA) restent instantanés.

**Pourquoi pas depuis le document Figma vivant** (tentant : gratuit, la page est sous la main) : en ouvrant la **v3 sur 10**, la page actuelle ne correspond plus — des calques ont été ajoutés/supprimés depuis. Les « intacts grisés » seraient ceux d'aujourd'hui, pas ceux de la version consultée. **Inacceptable pour un outil de versioning** : l'arbre doit refléter l'état historique.

L'endpoint reste **bête** (squelette pur, cacheable) ; c'est le plugin qui croise avec les `node_diffs` qu'il a déjà pour marquer modifié/cliquable.

### 6.3 Migration base

`assets` gagne une colonne `scope` :

```sql
-- migration 018
ALTER TABLE assets ADD COLUMN scope text NOT NULL DEFAULT 'frame'
  CHECK (scope IN ('frame','page'));
```

Les lignes existantes restent `'frame'` (lecture seule) ; les nouvelles captures créent des assets `'page'`. Marqueur explicite plutôt qu'inférence : un id de page n'est pas distinguable d'un id de nœud.

## 7. Viewer

**Arbre de calques** — complet, replié par défaut, **auto-déplié sur les chemins contenant des modifications**.

```
CAPTURE v3 · page "Écrans app"
▾ Accueil            5
  ▾ Header           2
    • Logo      rotation     ← cliquable
    • Titre      couleur     ← cliquable
    · Sous-titre             ← grisé, inactif
  ▸ Liste            3
  · Footer                   ← grisé
▸ Panier             2
· Réglages                   ← grisé
```

- **Cliquable ⟺ modifié** (D6). Les calques intacts sont grisés et inactifs — jamais de promesse que l'UI ne peut pas tenir. Si le plafond de rendus (§5) est atteint, les viewports modifiés en excès restent cliquables et affichent « Rendu indisponible. » : on dégrade franchement plutôt que de griser un calque qui a bel et bien changé.
- **Au clic sur un calque, même imbriqué** : on ouvre le rendu de **son viewport** avec ce calque sélectionné et surligné. Un `Vector` de 10×10 au fond d'une icône n'a aucun sens rendu seul ; l'arbre sert à **naviguer**, le viewport reste l'**unité de rendu**. C'est déjà le comportement de `selectedId` → `NodeDetail` + surlignage.
- Le plugin filtre `node_diffs` sur le viewport choisi et appelle `buildHighlights` **sans modification**.
- **Virtualisation** requise : une page réelle porte 500 à 1000+ calques dans un panneau de 400 px.

**Compat** : les versions sans `viewport` (frame-centric) retombent sur l'affichage actuel, à plat. Elles sont en lecture seule de toute façon.

## 8. Restore et clones d'historique

**Restore : par viewport, jamais par page.** Restaurer une page entière muterait des centaines de calques d'un coup — dangereux et lent. Le viewer étant par viewport, le restore l'est aussi : « restaurer *cette frame* dans l'état de *cette version* ». `figma.commitUndo()` (déjà en place) garde le retour arrière. Le restore page entière est **écarté par YAGNI**.

**Clones** — `dg/_history` garde 5 clones lossless, et ce poids pèse déjà sur le `.fig`. Cloner **la page** × 5 serait catastrophique. Donc : **cloner uniquement les viewports modifiés**, avec un plafond par checkpoint. Le volume reste proportionnel à ce qui change (souvent 1 à 3 frames), pas à la taille de la page.

## 9. Hors périmètre

- **Décommissionnement des branches** — 97 occurrences dans 26 fichiers, plus `versions.branch_name` avec sa contrainte d'unicité (migration 012). Lot séparé. **Ici on se contente d'exclure les pages `dg/*` de la capture** : c'est le seul couplage réel entre les deux sujets.
- Restore page entière ; restore par calque isolé (déjà en roadmap parkée, Lot 2).
- Capture multi-pages en une action.
- Bascule « afficher aussi les calques intacts comme cliquables ».

## 10. Spike préalable — BLOQUANT

**La seule inconnue rouge du design.** La capture est à ~1,6 s pour **une frame** (après le passage en région EU). Une page de 800 calques implique une extraction O(n) avec lecture d'`absoluteTransform` sur chaque nœud, et un JSON bien plus lourd à téléverser.

**Mesurer, sur une vraie page du fichier de test :**

| Métrique | Référence actuelle |
|---|---|
| Nombre de calques de la page | — |
| Temps d'extraction (plugin) | inclus dans 1,6 s |
| Poids du snapshot JSON | — |
| Temps de téléversement | — |
| **Temps total de capture** | **1,6 s (une frame)** |

**Seuils de décision :**

- **< 5 s** → design validé tel quel, on passe au plan.
- **5 – 15 s** → design tenable, mais le plan doit inclure un **retour de progression** pendant la capture.
- **> 15 s** → **revoir le design** avant tout plan : capture incrémentale, plafonds, ou exclusion des sous-arbres inchangés.

Le spike est jetable : il mesure, il ne livre pas de code conservé.

## 11. Risques

| Risque | Niveau | Traitement |
|---|---|---|
| Décalage des surlignages (bornes d'export ≠ bbox calculée) | ✅ éliminé | L'approche D3 ne rend jamais la page entière ; les viewports ont une géométrie Figma réelle |
| Rendu quasi vide si les calques sont éparpillés | ✅ éliminé | Idem — pas de rendu page entière |
| Gonflement du `.fig` par les clones | 🟠 maîtrisé | Clones des viewports modifiés uniquement + plafond (§8) |
| Qualité du Patch Note IA sur un gros delta | 🟠 à surveiller | Le résumé doit s'articuler par viewport (« 3 frames modifiées : … ») ; le regroupement d'icônes (#71) coupe déjà du bruit |
| Temps de capture / poids du snapshot | 🔴 inconnu | **Spike bloquant (§10)** |
| Arbre de 800+ lignes dans un panneau de 400 px | 🟠 connu | Virtualisation + repli par défaut (§7) |
| Page de design légitimement nommée `dg/…` | 🟢 accepté | Préfixe réservé, documenté |

## 12. Tests

En miroir des motifs déjà en place (base actuelle : **330 tests** — 200 backend, 130 plugin).

**Backend**
- `viewportRootMap` : descendant → son ancêtre de premier niveau ; un enfant direct de la page est son propre viewport ; la racine synthétique n'a pas de viewport.
- `bbox` relative au viewport (et non à la racine).
- Racine synthétique **exclue du diff** : deux captures d'une page identique dont la racine varierait ne produisent aucun changement.
- `viewports[]` : noms, dimensions, compte de changements.
- Endpoint `/layers` : squelette seul (aucun `fills`/`vectorPaths`), hiérarchie préservée, 404 et garde d'ownership comme les autres routes.

**Plugin**
- Capture : refuse une page `dg/*` ; n'exige aucune sélection.
- Arbre : replié par défaut, auto-déplié sur les chemins modifiés.
- Invariant **cliquable ⟺ modifié** : un calque intact n'est pas cliquable.
- Clic sur un calque imbriqué → ouvre le viewport ancêtre avec ce calque sélectionné.
- `buildHighlights` filtré par viewport : comportement inchangé.
- Compat : une version sans `viewport` s'affiche en mode plat.

## 13. Critères de succès

1. Une capture couvre **100 % des calques** de la page — aucun calque hors suivi.
2. **Aucune sélection** requise pour capturer.
3. L'arbre reflète la hiérarchie **de la version consultée**, pas du document actuel.
4. **Cliquable ⟺ modifié ⟺ a un rendu** — aucune impasse dans l'UI.
5. Aucune régression d'alignement des surlignages par rapport à aujourd'hui.
6. Temps de capture sous le seuil retenu au spike (§10).
7. Les 330 tests existants restent verts, complétés par ceux du §12.

## 14. Découpage suggéré pour le plan

Le périmètre est large mais cohérent. Quatre phases, chacune livrant quelque chose de vérifiable :

| Phase | Contenu | Vérifiable par |
|---|---|---|
| **0** | **Spike de mesure** (§10) — jetable | Les chiffres, et la décision go / adapter / revoir |
| **1** | Modèle : `viewportRootMap`, racine synthétique exclue du diff, `bbox` relative au viewport, `viewports[]`, migration 018 | Tests backend ; une capture de page produit un delta correct |
| **2** | Capture sans sélection + garde `dg/*` + rendus des viewports modifiés (flux §5) | Une capture réelle sur une page produit snapshot + rendus |
| **3** | Endpoint `/layers` + arbre de calques dans le plugin (replié, auto-déplié, grisage) | Navigation complète : arbre → clic → diff connu |
| **4** | Restore par viewport + clones bornés (§8) | Restaurer une frame depuis une version de page |

La phase 1 seule ne donne rien de visible à l'utilisateur ; le **minimum livrable** est 1+2+3. La phase 4 peut suivre dans un second temps si besoin de livrer plus tôt.
