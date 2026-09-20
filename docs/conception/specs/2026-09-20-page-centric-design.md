# Page-centric — suivre les frames d'une page

> **Statut** : design **révisé le 2026-09-20 après le spike de mesure** (§10). Le spike a invalidé la capture « page entière » ; le modèle a été ramené aux **frames suivies**. Le modèle géométrique (§3), lui, est inchangé.
> **Hors périmètre explicite** : le décommissionnement des branches (lot séparé, cf. §9).

## Révision — ce que le spike a changé

La version initiale de ce spec proposait **une capture = tous les calques de la page**. Les mesures (§10) ont donné **93,8 s et 10,1 Mo** sur une page réelle de 14 896 calques. Le gate a tranché : conception revue.

| | Avant le spike | Après |
|---|---|---|
| Unité de capture | tous les calques de la page | **les frames suivies** de la page |
| Navigation | arbre de calques complet, grisés + auto-dépli | **liste plate des frames suivies** |
| Endpoint `/layers` | requis | **supprimé** — `viewports[]` est déjà la liste |
| Virtualisation | requise (800+ lignes) | inutile (~10-20 frames) |
| Couverture | automatique et totale | **explicite** : l'utilisateur choisit |
| Modèle géométrique (§3) | viewport | **inchangé** |

---

## 1. Problème

Aujourd'hui une capture exige **une sélection d'un seul calque** (`main.ts:522-524`) et ne suit que le sous-arbre de ce nœud. Tout ce qui est hors de la frame trackée est **invisible au versioning** : le diff ment par omission.

**Le moteur du changement est la COUVERTURE** : que le suivi ne se limite plus à une seule frame désignée à la main. Le spike a montré qu'une couverture *automatique et totale* est hors de portée (§10). La couverture devient donc **explicite** : l'utilisateur voit toutes les frames de la page et désigne celles qu'il suit. Il choisit, donc il sait ce qui est suivi — un périmètre franc vaut mieux qu'une promesse intenable.

## 2. Décisions actées

| # | Décision | Conséquence |
|---|---|---|
| D1 | 1 page Figma = 1 asset = 1 timeline | Un checkpoint couvre **toutes les frames suivies** de la page, en une seule version |
| D2 | **Remplacement net** du mode frame | Les assets frame existants passent en **lecture seule** (consultables et restaurables, plus alimentés) |
| D3 | Capture des frames suivies, **lecture par viewport** | Le rendu reste au niveau d'une frame, qui a une vraie géométrie |
| D4 | Navigation par **liste plate des frames suivies** | Nom + nombre de changements ; clic → le diff actuel |
| D5 | La liste vient de `viewports[]`, **déjà dans la réponse** | Aucun endpoint supplémentaire, aucun poids ajouté |
| D6 | **Invariant : cliquable ⟺ modifié** | Suppression du repli SVG reconstruit dans ce mode ; un viewport modifié a un rendu dans le cas nominal (cf. plafond §5) |
| D7 | Le suivi d'une frame est marqué **dans le fichier Figma** (`pluginData`) | Voyage avec le fichier, partagé entre éditeurs, aucun aller-retour base — même mécanique que `dg_id` |
| D8 | **Rien n'est suivi par défaut** | Suivre d'office les 331 frames recréerait exactement le mur mesuré au spike |

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

**Viewport.** Tout **enfant de premier niveau suivi** : une frame le plus souvent, mais aussi un vecteur ou un texte posé directement sur la page. Chacun a une géométrie Figma réelle. C'est **le nouveau repère** :

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

## 4. Découverte, suivi, capture

### 4.1 Découverte — gratuite

Énumérer les frames d'une page ne coûte presque rien : on lit `id`, `name`, `type` et les dimensions de chaque enfant de premier niveau, **sans jamais descendre dans l'arbre**. C'est l'extraction profonde qui coûte (§10), pas l'énumération. Une page de 331 frames se liste instantanément.

### 4.2 Suivi — marqué dans le fichier

Une frame suivie porte `dg_tracked = '1'` dans son `pluginData` (D7). Conséquences :

- le marquage **voyage avec le fichier** et vaut pour tous les éditeurs, comme `dg_id` ;
- aucun aller-retour base pour savoir quoi capturer ;
- si une frame suivie est supprimée, elle disparaît simplement de la capture suivante.

**Rien n'est suivi par défaut** (D8). L'UI liste les frames avec une case à cocher, un champ de recherche (331 entrées se parcourent mal à la main) et une **estimation du coût** de la prochaine capture.

### 4.3 Estimation du coût — montrée à l'utilisateur

Le spike donne un ordre de grandeur exploitable : **3 à 6 ms par calque**, la borne haute correspondant aux arbres profonds et riches (vecteurs, textes). L'UI affiche donc une estimation du type « 12 frames suivies · ~540 calques · capture estimée ~3 s », et avertit au-delà d'un seuil. C'est le garde-fou qui empêche l'utilisateur de reconstruire le mur de 94 s sans s'en rendre compte.

### 4.4 Capture

`handleSnapshot()` ne demande plus de sélection :

1. **Garde** : refuser les pages techniques — nom commençant par `dg/` (branches et `dg/_history`). Le préfixe `dg/` est réservé et documenté.
2. **Garde** : refuser si aucune frame n'est suivie, avec un message qui renvoie vers la liste.
3. `await ensurePagesLoaded()` (déjà en place, requis par dynamic-page).
4. Construire la racine synthétique (§3) dont les `children` sont **les frames suivies uniquement**, chacune passée à `extractSnapshot`.
5. `FigmaSnapshot.figmaNodeId` = `page.id`, `figmaNodeName` = `page.name`.

`extractSnapshot` reste **inchangée** : elle prend un `SceneNode`, et les frames suivies en sont. Seule la racine est construite à la main.

### 4.5 Changement de périmètre de suivi — à ne pas confondre avec un changement de design

Si l'utilisateur coche ou décoche une frame entre deux checkpoints, le diff la verrait comme **ajoutée** ou **supprimée** — alors que le design n'a pas bougé. Ce serait un changelog qui ment.

La version stocke donc la liste des frames suivies (`tracked: string[]` dans le `DeltaJSON`). Au diff, une frame présente dans une seule des deux listes est classée **`scope_in` / `scope_out`**, et non `added` / `removed`. L'UI l'affiche à part : « entrée dans le suivi », « sortie du suivi ». Les frames présentes des deux côtés se diffent normalement.

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
tracked?:   string[]        // ids des frames suivies à cette capture (cf. §4.5)
```

`changes` compte les **groupes** au sens de #71 (les nœuds internes d'une même icône comptent pour 1), pas les nœuds bruts — sinon le compteur de la liste contredirait celui du viewer.

`nodeBboxRelative` prend une origine explicite (le viewport) au lieu de toujours `snapshot.root`.

### 6.2 Pas d'endpoint supplémentaire

La version initiale de ce spec prévoyait un endpoint `GET /versions/:id/layers` servant l'arbre complet des calques. **Il est supprimé** : la navigation se fait désormais sur la liste des frames suivies, et cette liste **est déjà** `viewports[]`, livrée avec la réponse existante. Rien à charger en plus, rien à mettre en cache, aucune virtualisation.

C'est le bénéfice collatéral du recentrage : la donnée dont l'UI a besoin était déjà là.

### 6.3 Migration base

`assets` gagne une colonne `scope` :

```sql
-- migration 018
ALTER TABLE assets ADD COLUMN scope text NOT NULL DEFAULT 'frame'
  CHECK (scope IN ('frame','page'));
```

Les lignes existantes restent `'frame'` (lecture seule) ; les nouvelles captures créent des assets `'page'`. Marqueur explicite plutôt qu'inférence : un id de page n'est pas distinguable d'un id de nœud.

## 7. Viewer

**Liste plate des frames suivies**, alimentée par `viewports[]` — pas d'arbre, pas de virtualisation.

```
CHECKPOINT v3 · page "📲 Hi-fi Prototype"
┌──────────────────────────────────┐
│ 3 frames modifiées               │
│  ▸ Onboarding / Étape 2     5    │
│  ▸ Panier                   2    │
│  ▸ Réglages                 1    │
│                                  │
│  · Accueil                  —    │  intacte, grisée
│                                  │
│  ↪ Paiement         entrée suivi │  cf. §4.5
└──────────────────────────────────┘
        ↓ clic sur "Panier"
   le diff actuel : rendu + surlignages + détail
```

- **Cliquable ⟺ modifié** (D6). Une frame suivie mais intacte est grisée et inactive. Si le plafond de rendus (§5) est atteint, les frames modifiées en excès restent cliquables et affichent « Rendu indisponible. » : on dégrade franchement plutôt que de griser une frame qui a bel et bien changé.
- **Au clic** : on ouvre le diff **tel qu'il existe aujourd'hui** — rendu de la frame, surlignages, panneau de détail. Le plugin filtre `node_diffs` sur le viewport choisi et appelle `buildHighlights` **sans modification**.
- Les entrées/sorties de périmètre (§4.5) sont affichées **à part**, jamais mélangées aux vrais ajouts et suppressions.

**Compat** : les versions sans `viewport` (frame-centric) retombent sur l'affichage actuel, à plat. Elles sont en lecture seule de toute façon.

## 8. Restore et clones d'historique

**Restore : par frame, jamais en bloc.** Restaurer d'un coup toutes les frames suivies muterait des milliers de calques — dangereux et lent. Le viewer étant par frame, le restore l'est aussi : « restaurer *cette frame* dans l'état de *cette version* ». `figma.commitUndo()` (déjà en place) garde le retour arrière. Le restore de l'ensemble du périmètre est **écarté par YAGNI**.

**Clones** — `dg/_history` garde 5 clones lossless, et ce poids pèse déjà sur le `.fig`. Cloner toutes les frames suivies × 5 serait catastrophique. Donc : **cloner uniquement les frames modifiées**, avec un plafond par checkpoint. Le volume reste proportionnel à ce qui change (souvent 1 à 3 frames), pas au périmètre suivi.

## 9. Hors périmètre

- **Décommissionnement des branches** — 97 occurrences dans 26 fichiers, plus `versions.branch_name` avec sa contrainte d'unicité (migration 012). Lot séparé. **Ici on se contente d'exclure les pages `dg/*` de la capture** : c'est le seul couplage réel entre les deux sujets.
- Restore de tout le périmètre en une action ; restore par calque isolé (déjà en roadmap parkée, Lot 2).
- Capture multi-pages en une action.
- **Arbre de calques complet** à l'intérieur d'une frame — écarté après le spike (§10) ; la navigation s'arrête au niveau frame, le détail d'un calque passe par le clic sur son surlignage, comme aujourd'hui.
- Détection automatique des frames « intéressantes » à suivre : le suivi reste un choix explicite (D8).

## 10. Spike — RÉALISÉ le 2026-09-20

Mesures prises dans Figma sur deux pages réelles du fichier de l'early adopter, code jetable retiré depuis.

| Métrique | Cover & Brief | **📲 Hi-fi Prototype** |
|---|---|---|
| Calques | 169 | **14 896** |
| Frames de 1er niveau | 6 | **331** |
| Profondeur max | 8 | 18 |
| **Temps d'extraction** | 0,54 s | **93,8 s** |
| **Poids JSON** | 123 Ko | **10,1 Mo** |

**Verdict : 🛑 seuil « > 15 s » franchi — la capture « page entière » est abandonnée.**

Deux enseignements au-delà du simple dépassement :

1. **Le coût est super-linéaire.** 88× plus de calques → **174× plus de temps** (6,3 ms/calque contre 3,2). La profondeur et la richesse des nœuds coûtent cher. Même au meilleur taux mesuré, ces 14 896 calques prendraient encore 48 s : ce n'est pas un réglage à ajuster, c'est un mur.
2. **Le poids est un second mur, indépendant du temps.** 10,1 Mo par checkpoint sature le Storage gratuit en une centaine de versions.

Cette page n'est pas une aberration : tous les écrans d'un prototype hi-fi sur une seule page est le cas d'usage normal de Figma. La mesure porte sur le vrai monde.

**Taux retenu pour l'estimation affichée à l'utilisateur (§4.3) : 3 à 6 ms par calque**, borne haute pour les arbres profonds et riches.

## 11. Risques

| Risque | Niveau | Traitement |
|---|---|---|
| Décalage des surlignages (bornes d'export ≠ bbox calculée) | ✅ éliminé | On ne rend jamais la page entière ; les frames ont une géométrie Figma réelle |
| Rendu quasi vide si les calques sont éparpillés | ✅ éliminé | Idem — pas de rendu page entière |
| Temps de capture / poids du snapshot | ✅ **résolu par le recentrage** | Mesuré (§10) puis borné : seules les frames suivies sont extraites. 12 frames ≈ 540 calques ≈ **~3 s**, contre 93,8 s pour la page entière |
| L'utilisateur suit trop de frames et recrée le mur | 🟠 **nouveau** | Estimation du coût affichée en continu + avertissement au-delà d'un seuil (§4.3) |
| Changement de périmètre pris pour un changement de design | 🟠 **nouveau** | Classement `scope_in`/`scope_out` distinct de `added`/`removed`, affiché à part (§4.5) |
| Couverture partielle : une frame non suivie change sans être vue | 🟠 **assumé** | C'est le compromis explicite du recentrage. L'utilisateur voit **toutes** les frames dans la liste, donc il sait ce qu'il ne suit pas — l'omission est visible, pas silencieuse |
| Gonflement du `.fig` par les clones | 🟠 maîtrisé | Clones des viewports modifiés uniquement + plafond (§8) |
| Qualité du Patch Note IA sur un gros delta | 🟠 à surveiller | Le résumé doit s'articuler par frame (« 3 frames modifiées : … ») ; le regroupement d'icônes (#71) coupe déjà du bruit |
| Page de design légitimement nommée `dg/…` | 🟢 accepté | Préfixe réservé, documenté |

## 12. Tests

En miroir des motifs déjà en place (base actuelle : **330 tests** — 200 backend, 130 plugin).

**Backend**
- `viewportRootMap` : descendant → son ancêtre de premier niveau ; un enfant direct de la page est son propre viewport ; la racine synthétique n'a pas de viewport.
- `bbox` relative au viewport (et non à la racine).
- Racine synthétique **exclue du diff** : deux captures d'une page identique dont la racine varierait ne produisent aucun changement.
- `viewports[]` : noms, dimensions, compte de changements (en **groupes**, cf. #71).
- `scope_in` / `scope_out` : une frame présente dans une seule des deux listes `tracked` n'est **jamais** classée `added`/`removed`.

**Plugin**
- Découverte : liste tous les enfants de premier niveau **sans extraction profonde**.
- Suivi : `dg_tracked` écrit et relu dans le `pluginData` de la frame ; rien de suivi par défaut.
- Estimation du coût : monotone croissante avec le nombre de calques suivis, avertissement au-delà du seuil.
- Capture : refuse une page `dg/*` ; refuse si aucune frame n'est suivie ; n'exige aucune sélection.
- Invariant **cliquable ⟺ modifié** : une frame suivie mais intacte n'est pas cliquable.
- `buildHighlights` filtré par viewport : comportement inchangé.
- Compat : une version sans `viewport` s'affiche en mode plat.

## 13. Critères de succès

1. Un checkpoint couvre **toutes les frames suivies**, en une seule version et une seule timeline.
2. L'utilisateur **voit toutes les frames de la page** et sait lesquelles sont suivies — l'omission est visible, jamais silencieuse.
3. **Aucune sélection** requise pour capturer.
4. **Cliquable ⟺ modifié** — aucune impasse dans l'UI.
5. Un changement de périmètre de suivi n'est **jamais** présenté comme un changement de design.
6. Aucune régression d'alignement des surlignages par rapport à aujourd'hui.
7. Capture d'un périmètre raisonnable (~10-15 frames) **sous 5 s**, conformément au taux mesuré au §10.
8. Les 330 tests existants restent verts, complétés par ceux du §12.

## 14. Découpage pour le plan

| Phase | Contenu | Vérifiable par | Statut |
|---|---|---|---|
| **0** | **Spike de mesure** — jetable | Les chiffres et la décision du gate | ✅ **fait** (§10) — a provoqué la révision |
| **1** | Modèle : `viewportRootMap`, racine constante sans diff, `bbox` relative au viewport, `viewports[]`, migration 018 | Tests backend ; un delta de page produit des viewports corrects | **inchangé par la révision** |
| **2** | Découverte + suivi (`dg_tracked`, liste, recherche, estimation) + capture des frames suivies + `tracked[]` et `scope_in/out` + rendus | Une capture réelle produit snapshot + rendus des frames suivies | révisé |
| **3** | Liste des frames dans le viewer (depuis `viewports[]`) | Liste → clic → le diff actuel | **simplifié** (plus d'endpoint, plus d'arbre) |
| **4** | Restore par viewport + clones bornés (§8) | Restaurer une frame depuis un checkpoint de page | inchangé |

La phase 1 seule ne donne rien de visible à l'utilisateur ; le **minimum livrable** est 1+2+3. La phase 4 peut suivre.

> **Note de pilotage (BC03).** Ce spec est un cas d'arbitrage documenté : une conception plausible, invalidée par **une mesure** avant d'écrire la moindre ligne de code de production. Coût du spike : une poignée de lignes jetables. Coût évité : l'implémentation complète d'une capture inutilisable à 93,8 s.
