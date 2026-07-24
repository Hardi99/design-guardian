# Spec — Capture/restore des fills IMAGE (hash seul)

> **Date** : 2026-06-10
> **Statut** : design validé, prêt pour plan
> **Contexte** : aujourd'hui un nœud avec un fill IMAGE **perd son image au restore** (`extractFills` ne gère que SOLID + GRADIENT). Perte de fidélité sur les designs complexes (qui utilisent des images).

---

## 1. Problème

`extractFills` (plugin `main.ts`) sérialise les fills SOLID et GRADIENT, mais **ignore le type IMAGE**. Donc :
- À la **capture**, un fill image n'est pas stocké.
- Au **restore same-branch** (`applyDeltaProps`), le bloc `fills` ne réapplique que SOLID/GRADIENT → l'image disparaît.

(Le restore **cross-branch** passe par le SVG `exportAsync` et préserve déjà l'image visuellement ; seul le same-branch est concerné.)

## 2. Décision : hash seul (pas les bytes)

On capture **`imageHash` + `scaleMode`**, pas les octets de l'image.
- Le **same-branch** restore réapplique `{ type:'IMAGE', imageHash, scaleMode }` : les octets vivent dans le document Figma, le hash est valide → l'image revient.
- Le **cross-branch** est déjà couvert par le SVG.
- Stocker les bytes (base64) **gonflerait le snapshot** (images = Mo → tue l'éco-conception + le souci data-URI 50KB du webview). **YAGNI.**

## 3. Changements

### 3.1 Type plugin — `plugin/src/types.ts`
`FigmaFill` : ajouter
```ts
  imageHash?: string;
  scaleMode?: string; // 'FILL' | 'FIT' | 'CROP' | 'TILE'
```

### 3.2 Capture — `extractFills` (`plugin/src/main.ts`)
Ajouter une branche IMAGE dans le `fills.map(...)` :
```ts
if (f.type === 'IMAGE') {
  base.imageHash = (f as ImagePaint).imageHash ?? undefined;
  base.scaleMode = (f as ImagePaint).scaleMode;
}
```
(`base` contient déjà `type`, `opacity`, `visible`.)

### 3.3 🔴 Schéma Zod backend — `backend/src/types/api.ts` (`figmaFillSchema`)
**Critique** : ajouter les champs, sinon Zod les **supprime silencieusement** (bug historique du projet) :
```ts
  imageHash: z.string().optional(),
  scaleMode: z.string().optional(),
```

### 3.4 Restore — bloc `fills` de `applyDeltaProps` (`plugin/src/main.ts`)
Ajouter une branche IMAGE dans la construction des `paints` :
```ts
} else if (f.type === 'IMAGE' && f.imageHash) {
  paints.push({
    type: 'IMAGE',
    imageHash: f.imageHash,
    scaleMode: (f.scaleMode as ImagePaint['scaleMode']) ?? 'FILL',
    visible: f.visible ?? true,
    opacity: f.opacity ?? 1,
  } as ImagePaint);
}
```
Garde : seulement si `f.imageHash` présent. L'application des fills est déjà dans le `try/catch` de `applyFullSnapshot` → un hash invalide n'avorte pas le restore (le fill courant reste).

## 4. Bonus gratuits (rien à coder)
- Le **diff backend** (`DiffService.compareSnapshots`) et le **live-diff** (`restoreDiff.changedProps`) comparent les fills par valeur/JSON → une fois `imageHash` présent, un **swap d'image devient détecté** (diff) et **restauré** (live-diff). Aucun changement requis.

## 5. Tests
- **Backend (garde-fou anti-footgun)** : `figmaFillSchema.parse({ type:'IMAGE', imageHash:'abc', scaleMode:'FILL' })` **conserve** `imageHash` + `scaleMode`. Empêche la régression « Zod strip ».
- **Plugin** : capture/restore = code `figma.*` (dur à unit-tester proprement) → vérif par `npm run typecheck` + `npm run build` + **test manuel** (nœud à fill image → checkpoint → changer l'image → restore → image d'origine revenue).

## 6. Hors scope
- Bytes d'image / cross-fichier / image supprimée (option B écartée — YAGNI ; cross-branch déjà couvert par SVG).
- `imageTransform` (CROP avancé) — non capturé pour le MVP.
