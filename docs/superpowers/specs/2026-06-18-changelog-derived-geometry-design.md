# Spec — Changelog : géométrie dérivée = mineure (brique A2)

> Raffinement du **changelog intelligent** (cf. `2026-06-17-changelog-intelligent-design.md`). Premier morceau « A2 » rentable, isolé de la partie restore coûteuse (cf. `2026-06-18-super-restore-roadmap.md` §5).

---

## 1. Problème

Une seule action de l'utilisateur (agrandir un élément, changer un padding) provoque un **reflow auto-layout** : tous les enfants en aval se décalent. Le diff actuel liste **chaque décalage dérivé** comme un changement → ~30 lignes pour 1 action (cascade `+63.71px` observée sur un cas réel). La significativité actuelle (par type/magnitude) ne sait pas distinguer **l'action** (authored) de ses **conséquences** (dérivées).

## 2. Objectif

Dans le changelog, **démote en `minor`** les changements de géométrie **dérivés** (recalculés par le moteur auto-layout) ; les changements **authored** restent `notable`. La cause ressort, le bruit est groupé (« + N ajustements mineurs »).

**Non-destructif** (invariant du changelog) : on ne modifie ni le diff 0.01px ni le `DeltaJSON` ; on **classe** seulement.

## 3. Règle (pure)

Un nœud est **enfant de flux** ssi : (`layoutSizingHorizontal` **ou** `layoutSizingVertical` défini) **ET** `layoutPositioning !== 'ABSOLUTE'`.
*(Figma ne renseigne `layoutSizing*` que pour les enfants d'auto-layout ; `layoutPositioning` distingue un enfant de flux — position recalculée — d'un enfant absolu — position authored.)*

Pour un `PropertyChange` donné, avec le contexte layout du nœud :

| Propriété | Devient `minor` si… | Sinon |
|---|---|---|
| `x`, `y` | nœud = enfant de flux | logique normale |
| `width` | `layoutSizingHorizontal ∈ {FILL, HUG}` | logique normale (FIXED = authored) |
| `height` | `layoutSizingVertical ∈ {FILL, HUG}` | logique normale |
| autres | — | logique `scoreChange` actuelle, **inchangée** |

Sans contexte layout (snapshot legacy, nœud hors auto-layout) → **comportement actuel** (rétro-compatible).

## 4. Flux des données (tranche verticale)

1. **Plugin** `extractSnapshot` (`main.ts`) : capter `layoutPositioning` via lecture guardée (le getter throw hors auto-layout) — même patron que `extractLayoutSizing`.
2. **Types + Zod** : `layoutPositioning?: 'AUTO' | 'ABSOLUTE'` sur
   - plugin `types.ts` → `NodeSnapshot`
   - backend `figma.ts` → `NodeSnapshot`
   - backend `api.ts` → `nodeSnapshotSchema` (sinon supprimé silencieusement — règle d'or du projet).
3. **`NodeDelta`** (backend `figma.ts`) : ajouter `layoutSizingHorizontal?`, `layoutSizingVertical?`, `layoutPositioning?` (optionnels).
4. **`diff.service.ts`** : à la construction de chaque `NodeDelta` (modified/added/removed), **recopier** ces 3 champs depuis le snapshot **v2** (le nouvel état). Pas de logique, juste du passthrough.
5. **`significance.service.ts`** :
   - `scoreChange(change, ctx?)` — `ctx?: { layoutSizingHorizontal?, layoutSizingVertical?, layoutPositioning? }`. Applique la règle §3 pour `x/y/width/height` quand `ctx` est fourni ; sinon logique actuelle.
   - `rankDelta(delta)` construit le `ctx` de chaque `NodeDelta` et le passe à `scoreChange` pour chacun de ses `changes`.

## 5. Architecture / isolation

- Cœur **pur** (`scoreChange`, helper `isFlowChild`) → testable sans Figma ni backend.
- `ctx` **optionnel** → zéro régression (les 12 tests significativité existants restent verts inchangés).
- `diff.service` ne fait que **recopier** des champs (aucune décision).
- `prompt` (`openai.service`) **inchangé** : il consomme déjà le delta rangé par `rankDelta` ; moins de notables = résumé plus propre, automatiquement.

## 6. Tests

**Purs (TDD) — `significance.service.test.ts` :**
- `scoreChange` + `ctx` enfant de flux : `x`/`y` → `minor`.
- `width` avec `layoutSizingHorizontal='FILL'` → `minor` ; `='FIXED'` → `notable` (authored).
- `height` via `layoutSizingVertical` (idem).
- enfant **absolu** (`layoutPositioning='ABSOLUTE'`) : `x`/`y` → **notable** (authored).
- `scoreChange` **sans `ctx`** → identique à aujourd'hui (non-régression).
- `rankDelta` : nœud dont tous les changements sont dérivés → `minorModified`.

**Glue (typecheck + vérif manuelle) :** capture plugin `layoutPositioning`, passthrough `diff.service`.

## 7. Hors périmètre (différé, assumé)

- **Capturer `paddingX`/`itemSpacing`/`layoutMode` du frame** pour afficher la cause explicite (« padding 16→24 »). Plus gros. Ici, la cause ressort déjà via le **resize FIXED authored** (cas du logo). À faire si les beta le réclament.
- Lien causal explicite parent→enfants (« ce reflow vient de X »). Non nécessaire : classer correctement (authored notable / dérivé minor) suffit à faire ressortir la cause.

## 8. Non-goals
- Ne modifie pas le moteur de diff, le `DeltaJSON`, ni le restore.
- Ne supprime aucun changement (tout reste dans le delta ; on ne change que le **rang**).
