# Spec — Changelog lisible designer (rendu hybride)

> Le changelog est le **moat**. Aujourd'hui il est **illisible** pour un designer : noms de propriétés (`fontWeight`), hex bruts, px, **et** gpt-4o-mini **massacre** des données pourtant propres (`#00F0FF` → `#00FF0FF`, `600→800` → `800→800`). On le rend lisible et fiable.

---

## 1. Constat (vérifié sur données réelles)

- **Le diff est PROPRE** : hex valides 6 caractères, rotations/poids corrects, **zéro** non-changement. (Vérifié en base : 0 changement `old==new`.)
- **gpt-4o-mini hallucine/garble** les détails → c'est lui le problème de lisibilité, pas la donnée.

## 2. Décision (brainstorm) — hybride (c)

- **Liste déterministe** (par règles, code) = le cœur lisible et **fiable** de chaque changement.
- **Titre IA** (gpt-4o-mini gardé) = **une seule ligne** d'ensemble. Son rôle se réduit → plus de détails techniques à halluciner.
- **Couleurs : pastille + code HEXA** (jamais de nom approximatif) — **précision** voulue (retours beta).
- On **ne switch pas** vers Claude maintenant.

## 3. Composants

### 3.1 `formatChange` (backend, PUR, testé) — `backend/src/services/change-format.service.ts`
`formatChange(change: PropertyChange): ReadableChange`

```ts
type ReadableChange =
  | { kind: 'color';    label: string; from?: string; to?: string }   // hex bruts conservés
  | { kind: 'weight';   label: string; from?: string; to?: string }   // nom de graisse (SemiBold…)
  | { kind: 'rotation'; label: string; degrees: number }              // ex. +180
  | { kind: 'move';     label: string; dx: number; dy: number }       // px
  | { kind: 'resize';   label: string; dw: number; dh: number }       // px
  | { kind: 'text';     label: string; from?: string; to?: string }   // contenu texte
  | { kind: 'opacity';  label: string; from: number; to: number }     // %
  | { kind: 'visibility'; label: string; visible: boolean }
  | { kind: 'generic';  label: string; detail: string };              // repli (jamais d'hallucination)
```

Règles de mapping (designer-language) :
| property (diff) | ReadableChange |
|---|---|
| `fill`, `stroke` | `color` — `from`/`to` = **hex tels quels** |
| `fontWeight` | `weight` — `from`/`to` = nom (`weightName(400)='Regular'`, 600=`SemiBold`, 700=`Bold`, 800=`ExtraBold`…) |
| `fontFamily`, `fontStyle` | `text` (police) |
| `characters` | `text` (contenu) |
| `rotation` | `rotation` — `degrees` (depuis `delta` ou `new-old`) |
| `x`,`y` | **fusionnés** en un `move` (dx, dy) |
| `width`,`height` | `resize` (dw, dh) |
| `opacity` | `opacity` (en %) |
| `visible` | `visibility` |
| inconnu / illisible | `generic` (label = property, detail = delta) — biais sûr |

`weightName(n)` : table fixe (pure). `x`/`y` (et `width`/`height`) du même nœud se **fusionnent** en un seul `move`/`resize` au niveau de l'agrégation (cf. 3.2).

### 3.2 Agrégation par nœud — `formatNodeChanges(nodeDelta): ReadableChange[]`
Transforme les `PropertyChange[]` d'un nœud en `ReadableChange[]` **fusionnés** (x+y → 1 `move`, w+h → 1 `resize`), en ignorant les changements **mineurs** (réutilise `scoreChange` de #41 : la cascade dérivée n'encombre pas la liste).

### 3.3 Exposition API
- **Diff endpoint** (`GET /versions/:id`) : chaque `node_diff` porte `readable: ReadableChange[]` (formaté backend).
- **Checkpoint response** (POST) : inchangé pour le delta ; le plugin peut formater depuis `analysis` à l'affichage immédiat (même service, voir 3.5).

### 3.4 Titre IA (gpt-4o-mini) — `openai.service.ts`
Le prompt ne demande plus qu'**une ligne** : un titre d'ensemble (« Refonte des couleurs du header »). Plus de liste « propriété : old → new » → plus rien à halluciner sur les détails. Reste **asynchrone** ; le détail déterministe s'affiche **immédiatement** sans l'attendre.

### 3.5 Rendu plugin (UI) — `diffReducer`/`ui.tsx`
- Affiche : **titre** (IA, quand dispo) + **liste par élément** depuis `readable` :
  - `color` → **pastille** (carré coloré via le hex) + **code hexa** : `▮#00F0FF → ▮#4B898D`
  - `weight` → `Graisse : SemiBold → ExtraBold`
  - `rotation` → `↻ Pivoté 180°` · `move` → `Déplacé : 4px →, 3px ↑` · `resize` → `Redimensionné : +20px` · `text` → `« ancien » → « nouveau »` · `opacity`/`visibility`/`generic`
- **Notables d'abord**, **mineurs repliés** (« + N micro-ajustements »).

## 4. Tests

- **Purs (TDD) — `change-format.service.test.ts`** : `formatChange` pour chaque type (`fill`→color hex conservés ; `fontWeight`→weight nommé ; `rotation` ; `x`+`y` fusion `move` ; inconnu→generic), `weightName`, `formatNodeChanges` (fusion + filtre mineurs).
- **Glue** (endpoint passthrough, prompt court, rendu UI) : typecheck + vérif manuelle.

## 5. Hors périmètre (assumé) — chantiers SUIVANTS, notés

- **Nommer les couleurs** (« teal ») : non — hex précis (beta). Éventuel nom approché = bonus futur.
- **Clustering « bloc déplacé »** (regrouper la cascade en « bloc déplacé », solution générale par delta identique) : chantier séparé, complémentaire.
- **Rendu image de l'onglet Nodes** : aujourd'hui la vignette = SVG de la frame entière avec `viewBox` zoomé (les voisins bavent, lourd). Suivi dédié : (a) **isoler le nœud** via `generateSvgFromNode` (existe déjà), (b) **pas de vignette** pour les changements d'attribut pur (couleur/graisse) — le `ReadableChange` suffit, image réservée au structurel/positionnel.
- **Swap Claude** : différé (la lisibilité ne dépend plus du modèle, c'est déterministe).

## 6. Non-goals
- Ne change pas le moteur de diff (il est correct).
- Ne supprime pas le titre IA (il reste, mais réduit à 1 ligne).
