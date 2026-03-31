# Déblocages Majeurs — Design Guardian

Bilan des fixes critiques qui ont permis de faire fonctionner les fonctionnalités core du plugin.

---

## 1. Abandon de `exportAsync` → Propriétés natives Figma

**Problème**
L'approche initiale exportait le SVG d'un node via `exportAsync({ format: 'SVG' })` pour en extraire les données visuelles. Deux blocages :
- La permission `exportData` dans `manifest.json` était invalide → erreur au chargement du plugin
- Le SVG exporté n'est pas diffable structurellement (c'est du markup aplati, pas des propriétés)
- Dépendances inutiles embarquées : `svgson`, `transformation-matrix`, `svg-path-properties`

**Fix**
Extraction directe via l'API native Figma dans `main.ts` :
- Positions absolues : `node.absoluteTransform`
- Fills, strokes, effects : `node.fills`, `node.strokes`, `node.effects`
- Géométrie vectorielle : `node.vectorPaths`
- Texte : `node.characters`, `node.fontSize`, `node.fontName`

**Résultat débloqué**
Première visualisation des nodes vectoriels (VECTOR, STAR, POLYGON). Diff géométrique précis au pixel. Snapshot JSON pur, sans permission spéciale dans le manifest.

**Commit** `2076ca8 chore: remove dead SVG export code`

---

## 2. Schéma Zod incomplet → Champs silencieusement supprimés

**Problème**
Zod utilise le mode `strip` par défaut sur `z.object()` : tout champ non déclaré dans le schéma est supprimé à la validation, sans erreur, sans warning. Le `nodeSnapshotSchema` dans `backend/src/types/api.ts` ne déclarait pas :

- `characters` (contenu textuel)
- `fontSize`, `fontFamily`
- `visible`, `rotation`
- `effects`
- `gradientStops`, `gradientAngle`

Ces champs étaient présents dans le snapshot envoyé par le plugin, supprimés par Zod avant stockage, et donc absents de `snapshot_json` en base Supabase. Résultat : les textes ne s'affichaient jamais, les effets et rotations n'étaient jamais diffés.

**Diagnostic**
Le plugin capturait correctement les données (confirmé par logs console Figma : `typeof= string` pour `characters`). La perte se produisait côté backend, à la validation.

**Fix**
Ajout de tous les champs manquants dans `nodeSnapshotSchema`, `figmaFillSchema`, et nouveau `figmaEffectSchema`.

**Résultat débloqué**
Affichage des vrais textes dans le rendu SVG. Diff des propriétés `characters`, `rotation`, `visible`, `effects` désormais opérationnel.

**Commit** `a0126b0 fix: add missing fields to Zod schema (characters, effects, rotation)`

---

## 3. Limite data URI dans le webview Figma → SVG inline

**Problème**
Le rendu des frames complètes utilisait `<img src="data:image/svg+xml;base64,${svg}">`. Les SVGs des frames complexes (ex. écran mobile 428×926 avec des centaines de nodes) dépassaient la limite de taille des data URI acceptée par le webview Figma → l'image ne se chargeait pas et affichait uniquement le texte `alt`.

Les mini-SVGs des nodes individuels (quelques centaines d'octets) fonctionnaient sans problème. Seuls les SVGs de frames entières échouaient.

**Fix**
Remplacement de `<img>` par un composant `SvgFrame` qui :
1. Décode le base64 via `atob()`
2. Injecte le SVG directement dans le DOM via `dangerouslySetInnerHTML`
3. Supprime les attributs `width`/`height` fixes du SVG pour laisser le CSS contrôler la taille

```tsx
function SvgFrame({ b64 }: { b64: string }) {
  const html = useMemo(() => {
    const svg = atob(b64);
    return svg
      .replace(/\s+width="[^"]*"/, '')
      .replace(/\s+height="[^"]*"/, '')
      .replace('<svg', '<svg style="width:100%;height:100%;display:block" ...');
  }, [b64]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```

**Note sur `innerHTML` vs `innerText`**
`innerText` ne fonctionne pas ici — il injecte du texte brut, pas du markup. `innerHTML` est sans risque car le SVG est généré par notre propre backend, pas par une entrée utilisateur.

**Résultat débloqué**
Frame view (Split + Overlay) opérationnel pour n'importe quelle taille de frame.

**Commit** `da85c8d fix: inline SVG rendering for frame view to bypass data URI limits`

---

## 4. `figma.mixed` Symbol → Guards `safeNum` / `safeStr`

**Problème**
L'API Figma retourne le Symbol `figma.mixed` pour les propriétés dont la valeur est mixte sur un node (ex. `cornerRadius` différent sur chaque coin). Ce Symbol n'est pas sérialisable via `postMessage` et n'est pas JSON-sérialisable → perte silencieuse de la valeur.

**Fix**
```typescript
function safeNum(v: unknown): number | undefined {
  return typeof v === 'symbol' ? undefined : (v as number);
}
```

Appliqué sur `cornerRadius`, `strokeWeight`, `fontSize`.

**Résultat débloqué**
Fin des crashes silencieux sur les nodes avec propriétés mixtes (composants, frames multi-coins).

**Commit** `14df015 fix: handle figma.mixed symbol in cornerRadius`

---

## 5. Branches = labels uniquement → Isolation réelle via pages Figma

**Problème**
Le système de branches initial n'était qu'un filtre de label sur les checkpoints. Toutes les branches partageaient le même canvas Figma : switcher de branche n'avait aucun effet visuel sur le design. Concrètement, travailler sur `feat/onboarding` écrasait silencieusement le travail sur `main` — un seul design pour toutes les branches.

C'est le problème fondamental que les branches Git résolvent pour le code : isolation complète entre les versions de travail.

**Fix**
Chaque branche Design Guardian crée désormais une vraie page Figma nommée `dg/{branchName}` :
- `CREATE_BRANCH` : `figma.createPage()` + clone de la sélection courante + `figma.currentPage = newPage`
- `SWITCH_BRANCH` : `figma.currentPage = page` vers la page correspondante
- `main` pointe toujours vers la première page non-préfixée `dg/`

```typescript
const newPage = figma.createPage();
newPage.name = `dg/${branchName}`;
for (const node of figma.currentPage.selection) {
  newPage.appendChild(node.clone());
}
figma.currentPage = newPage;
```

**Résultat débloqué**
Isolation design réelle : un designer peut travailler sur `feat/dark-mode` sans toucher `main`. Switcher de branche navigue physiquement vers la page Figma correspondante. C'est l'équivalent de `git checkout` pour le design.

**Commit** `9f6da16 feat: branch isolation via Figma pages`

---

## Synthèse

| Fix | Bloquait quoi | Racine |
|-----|---------------|--------|
| Abandon `exportAsync` | Nodes vectoriels invisibles, plugin ne charge pas | Architecture |
| Zod schema incomplet | Textes jamais capturés, diff partiel | Backend validation |
| data URI size limit | Frame view inutilisable | Frontend rendering |
| `figma.mixed` Symbol | Crash sur nodes complexes | API Figma edge case |
| Branches = labels sans isolation | Toutes les branches écrasaient le même canvas | Architecture |

---

## Roadmap visuel (non bloquant pour la soutenance)

**Option 2 — Figma REST API `format=svg`**

Endpoint : `GET api.figma.com/v1/images/{fileKey}?ids={nodeId}&format=svg`

Avantages vs reconstruction SVG actuelle :
- Rendu pixel-perfect (Figma rend lui-même)
- Polices custom, images, effets complexes corrects
- Infiniment zoomable (SVG, pas PNG)
- Zéro maintenance si Figma évolue

Auth requise : Personal Access Token (démo) ou OAuth 2.0 Figma (produit).

Branche : `feat/figma-rest-png`
