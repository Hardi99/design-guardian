# Spec — Détection de « blocs déplacés » (cascade → 1 ligne nommée)

> Suite du changelog (moat). Un déplacement de bloc en auto-layout décale **tous** les nœuds en aval du **même** Δ (ex. 343 nœuds à -51px). Aujourd'hui ils sont démotés en mineurs et groupés en « +N ajustements mineurs » — **muet**. On les transforme en **« Bloc « X » déplacé · -51px · N éléments »**, le bloc **nommé** via l'arbre.

---

## 1. Objectif

- **Regrouper** les déplacements dérivés partageant le même Δ en **clusters**.
- **Nommer** le bloc : précis si le cluster a une racine unique, sinon par l'**ancêtre commun** (conteneur). **Jamais de nom inventé/faux** — toujours un vrai nœud de l'arbre.
- **Une ligne** par cluster, à la place des N lignes muettes.
- **Non-destructif** : on ne touche ni le diff ni le `DeltaJSON` ; on **résume** pour l'affichage + le titre IA.

## 2. Pourquoi le nommage est fiable

Cluster = nœuds décalés du même Δ. Ses **racines** = nœuds du cluster dont le **parent n'est PAS dans le cluster** (sommet du sous-arbre décalé).
- **1 racine** → c'est LE bloc déplacé → nom **précis** (cas « bloc de fin », rien ne reflue après).
- **>1 racine** (bloc + frères reflués) → nom = **ancêtre commun** (le conteneur) : moins précis mais **toujours un vrai ancêtre**, jamais trompeur.

## 3. Composants (backend — il a l'arbre du snapshot)

### 3.1 Purs (TDD) — `backend/src/services/block-moves.service.ts`

```ts
export interface BlockMove { name: string; dx: number; dy: number; count: number }

// Arbre du snapshot → maps id→parentId et id→name.
function buildTreeMaps(root: NodeSnapshot): { parent: Map<string, string | null>; name: Map<string, string> }

// Ancêtre commun le plus proche d'un ensemble d'ids (via parent map). Renvoie l'id, ou '' si aucun.
function commonAncestor(ids: string[], parent: Map<string, string | null>): string

// Détecte les blocs déplacés : groupe les déplacements DÉRIVÉS par Δ (arrondi px),
// garde les groupes ≥ minCount, nomme par racine unique / ancêtre commun.
function detectBlockMoves(
  delta: DeltaJSON,
  parent: Map<string, string | null>,
  name: Map<string, string>,
  minCount: number,
): BlockMove[]
```

**Règles `detectBlockMoves` :**
- Pour chaque `nd` de `delta.modified` : calculer `dx`/`dy` (depuis les `PropertyChange` `x`/`y` : `new - old`, sinon 0). Ne retenir que les **déplacements dérivés** (`scoreChange` de la position = `minor`, via le contexte layout du nœud).
- Clé de cluster = `${round(dx)},${round(dy)}` (arrondi au px ; un reflow est uniforme, les µ-diffs float = même cluster). Ignorer `(0,0)`.
- Pour chaque groupe `ids` avec `ids.length >= minCount` :
  - `roots = ids` dont `parent.get(id)` ∉ `ids`.
  - `blockName = roots.length === 1 ? name.get(roots[0]) : name.get(commonAncestor(roots, parent))` (repli sur `''`).
  - push `{ name: blockName, dx: round(dx), dy: round(dy), count: ids.length }`.
- Trier par `count` décroissant.

### 3.2 Exposition — `branches.controller.ts` (diff endpoint)
- Construire `{ parent, name }` via `buildTreeMaps(currentSnap.root)`.
- `const blockMoves = detectBlockMoves(delta as DeltaJSON, parent, name, 3)`.
- Ajouter `block_moves: blockMoves` à la réponse JSON.

### 3.3 Rendu plugin — `diffReducer.ts` + `ui.tsx`
- `DiffData` gagne `block_moves?: BlockMove[]` (type miroir).
- Le diff viewer affiche, **en tête de la liste Nodes**, une section repliable par `BlockMove` : `⤢ Bloc « Footer » déplacé · -51px · 330 éléments`.
- Les nœuds appartenant à un cluster ne sont **pas** listés individuellement (déjà mineurs/sans `readable`) — le `BlockMove` les représente.

## 4. Tests

- **Purs (TDD) — `block-moves.service.test.ts`** :
  - `buildTreeMaps` : arbre imbriqué → maps parent/name correctes.
  - `commonAncestor` : 2 frères → leur parent ; nœud + son enfant → le nœud ; aucun commun → `''`.
  - `detectBlockMoves` :
    - 3 nœuds frères décalés de -51 (sous un parent non décalé) → 1 `BlockMove` nommé par le **parent** (>1 racine).
    - un bloc (racine unique) + ses descendants décalés de -51 → `BlockMove` nommé par **le bloc** (1 racine).
    - groupe < `minCount` → ignoré.
    - déplacement **non dérivé** (enfant absolu / FIXED authored) → non clusterisé.
- **Glue** (endpoint, prompt, rendu UI) : typecheck + vérif manuelle.

## 5. Hors périmètre (assumé)
- **Titre IA « bloc déplacé »** : la génération est async et ne dispose pas de l'arbre/snapshot ; le coupler complexifierait. Le cœur déterministe (ligne nommée dans le viewer) suffit. À ajouter plus tard si voulu.
- Lier explicitement le cluster à **sa cause** (« logo agrandi → recomposition ») : non — le resize authored est déjà notable et séparé ; le cluster dit juste « bloc déplacé ».
- Clusters de **resize** uniforme (rare) : v1 = déplacements seulement (`move`). Extension possible plus tard.

## 6. Non-goals
- Ne modifie pas le moteur de diff ni le `DeltaJSON`.
- Ne supprime aucun nœud du delta — on ne change que l'**affichage** (regroupement) + le titre.
