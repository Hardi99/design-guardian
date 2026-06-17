# Spec — Changelog intelligent (significativité passive)

> Doc de cadrage **conceptuel**. Premier chantier de la trajectoire post-pivot (focus **diff + changelog + restore**). Valide le 2026-06-17.

---

## 1. Contexte & objectif

Aujourd'hui le diff produit un `DeltaJSON` au **0.01px** ; l'AI Patch Note en fait un **résumé FR à plat**. Problème : à fort volume (a fortiori avec le design généré par IA), le résumé **noie le notable sous le bruit sous-perceptuel**.

**Objectif :** rendre le changelog **intelligent et passif** — faire ressortir *ce qui compte* — **sans ajouter ni étape, ni alerte, ni configuration** (anti-friction = leçon Abstract). C'est de la **version-history intelligente**, pas du contrôle de version.

## 2. Invariant CRITIQUE — non-destructif

> La significativité **ne touche JAMAIS au diff 0.01px.**

Le `DeltaJSON` complet reste **calculé, stocké (`analysis_json`), affiché dans le diff viewer, et restaurable** — rien n'est jeté. La significativité est une **couche de présentation par-dessus** : elle **hiérarchise**, elle ne **filtre/supprime** rien. Un user pixel-perfect garde toute la précision ; les autres voient « ce qui compte » d'abord.

- **ε = 0.01px** = *« est-ce que ça a changé ? »* (détection — inchangé).
- **Seuil de significativité** = *« est-ce qu'un humain s'en soucie ? »* (nouveau — présentation).

## 3. Où ça vit

- **100 % backend** (à côté de `diff.service`, là où naît le `DeltaJSON` et où l'IA résume).
- **Plugin INCHANGÉ en v1** : le `ai_summary` affiché devient juste plus malin (le plugin polle le même champ). Aucune nouvelle UI = aucune friction.

## 4. Composants

### 4.1 `backend/src/services/significance.service.ts` (PUR, testé)
```ts
type Significance = 'notable' | 'minor';
function scoreChange(change: PropertyChange): Significance
```
Règles **v1** (centralisées dans un objet de seuils, ajustables — les beta calibreront) :

| Propriété | Notable si… |
|---|---|
| `fills`, `strokes`, `characters`, `visible`, `vectorPaths`, `effects`, `imageHash`, `fontFamily/Style` | **toujours** (qualitatif) |
| `x`, `y`, `width`, `height` | `|new − old| ≥ POS_THRESHOLD` (v1 = **1px**) |
| `opacity` | `|Δ| ≥ 0.05` |
| `rotation` | `|Δ| ≥ 1°` |
| `cornerRadius`, `strokeWeight` | `|Δ| ≥ 1px` |
| autres / non lisibles | **notable** (biais conservateur : dans le doute, on montre) |

Nœud **ajouté/supprimé** → toujours notable.

### 4.2 `rankDelta(delta: DeltaJSON)` (PUR, testé)
Partitionne en `{ notable: NodeDelta[], minor: NodeDelta[], minorCount: number }` (un nœud est *notable* s'il a ≥ 1 changement notable ; sinon *minor*). Ne mute pas l'entrée.

### 4.3 Intégration prompt IA (`checkpoint-ai.service` / `openai.service`)
Le prompt reçoit le **delta rangé** : il **mène avec le notable**, **regroupe le mineur** (« + N ajustements mineurs »). Même flux **asynchrone** existant ; seul l'**input du prompt** change.
Exemple de sortie visée : *« Refonte du header : couleur → bleu marque, titre +4px. (+12 ajustements mineurs.) »*

## 5. Data flow
```
compareSnapshots → DeltaJSON (0.01px, intact)
                 → rankDelta(DeltaJSON)            [nouveau, pur]
                 → prompt IA enrichi               [input modifié]
                 → ai_summary (hiérarchisé)
plugin: polle le même ai_summary, simplement meilleur.
```

## 6. Tests
- **Cœur pur → TDD** (comme `identity`/`restoreDiff`) : `scoreChange` (chaque règle + seuils + biais conservateur) et `rankDelta` (partition, comptage, non-mutation).
- **Prompt** : vérif manuelle sur quelques `DeltaJSON` réels (le LLM n'est pas testé unitairement).

## 7. Hors périmètre (YAGNI / chantiers séparés)
- **Swap modèle → Claude** (alignement « se calquer » sur l'écosystème Figma/Anthropic) : chantier **adjacent**, pour ne pas coupler une migration de modèle ici. Noté en roadmap.
- **Tri de la vue « Nodes »** dans le plugin (notable d'abord) : amélioration UI **v2**.
- **Checks design-system / mode « actif » (alertes)** : explicitement écarté (friction = piège Abstract). À reconsidérer seulement si les beta le réclament.
- **Significativité configurable par l'utilisateur** : v1 = seuils par défaut figés ; perso plus tard si demande.

## 8. Non-goals
- Ne modifie PAS le moteur de diff ni le stockage `analysis_json` (invariant §2).
- Ne supprime/masque aucun changement de façon irréversible (le diff viewer garde tout).
- N'ajoute aucune alerte, étape, ou configuration en v1.
