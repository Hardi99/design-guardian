# Render — Format adaptatif (SVG vectoriel / PNG borné) — Plan A

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Le plugin choisit le format d'aperçu — **SVG si l'export vectoriel reste léger** (zoom net), **sinon PNG borné** (raster/lourd, à échelle dégressive) — pour gérer les designs avec images sans jeter le rendu.

**Architecture :** Phase 1 de la spec `2026-06-27-render-pipeline-png-blob-design.md`. On change **uniquement le format** ; le transport reste l'existant (`_render.json` enveloppant le b64, rendu inline). **L'UI rend déjà le PNG** (`SvgFrame`/`NodeThumb` → `<img data:image/png>` sur préfixe `iVBO`), donc aucun changement d'affichage. Le **transport blob+URL signée + crops CSS** = Plan B (suivant).

**Tech Stack :** Plugin Preact + Vitest ; backend Hono + Vitest.

## Global Constraints

- TypeScript **strict, zéro `any`**.
- `figma.*` uniquement dans `main.ts` ; HTTP uniquement dans `ui.tsx`.
- Seuils : **SVG ≤ ~800 Ko b64 → SVG** ; sinon **PNG**, échelles **2→1→0,5** (on garde dès que ≤ ~1,2 Mo, plancher 0,5).
- Champ existant `render_svg_b64` **conservé** (porte le b64 SVG **ou** PNG) ; on **ajoute** `render_kind: 'svg'|'png'` (défaut `'svg'`).
- Plugin : `npm run typecheck && npm run test:run && npm run build` (depuis `plugin/`). Backend : `npm run typecheck && npm run test:run` (depuis `backend/`).
- **Stage uniquement** les fichiers de la tâche (jamais `.devcontainer/`). Commits finis par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure
- Create `plugin/src/renderFormat.ts` (+ test) — décision pure `chooseFormat` + constantes.
- Modify `plugin/src/main.ts` — export adaptatif SVG/PNG ; garde restore (ne pas `createNodeFromSvg` un PNG).
- Modify `plugin/src/types.ts` — `SNAPSHOT_READY` + `render_kind`.
- Modify `plugin/src/store.ts` — état `renderKind` + `setSnapshot`.
- Modify `plugin/src/ui.tsx` — propage `render_kind` (message → store → POST checkpoint) ; retire le warning « frame complexe ».
- Modify `backend/src/types/api.ts` — `render_kind` dans `createCheckpointSchema`.
- Modify `backend/src/controllers/checkpoints.controller.ts` — passe `renderKind`.
- Modify `backend/src/services/versioning.service.ts` (+ test) — stocke sous `png_b64`/`svg_b64` selon le kind.

---

## Task A1 : Plugin — capture adaptative

**Files:** Create `plugin/src/renderFormat.ts`, `plugin/src/renderFormat.test.ts` · Modify `plugin/src/main.ts`, `plugin/src/types.ts`, `plugin/src/store.ts`, `plugin/src/ui.tsx`

**Interfaces produites :** `chooseFormat(svgB64Len, svgMax?) → 'svg'|'png'` ; constantes `SVG_MAX_B64`, `PNG_MAX_B64`, `PNG_SCALES` ; message `SNAPSHOT_READY` gagne `render_kind?: 'svg'|'png'`.

- [ ] **Step 1 : Test qui échoue**

Create `plugin/src/renderFormat.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { chooseFormat, SVG_MAX_B64 } from './renderFormat';

describe('chooseFormat', () => {
  it('SVG léger → svg', () => expect(chooseFormat(500_000)).toBe('svg'));
  it('SVG lourd (images embarquées) → png', () => expect(chooseFormat(3_000_000)).toBe('png'));
  it('pile au seuil → svg (≤)', () => expect(chooseFormat(SVG_MAX_B64)).toBe('svg'));
  it('juste au-dessus → png', () => expect(chooseFormat(SVG_MAX_B64 + 1)).toBe('png'));
});
```
Run (depuis `plugin/`): `npm run test:run -- src/renderFormat.test.ts` → FAIL (module absent).

- [ ] **Step 2 : Implémenter `renderFormat.ts`**

Create `plugin/src/renderFormat.ts` :
```ts
// Décision pure du format d'aperçu. L'export réel (exportAsync) se fait dans main.ts.
// SVG si l'export vectoriel reste léger (zoom sans perte) ; sinon PNG borné (raster/lourd).
export const SVG_MAX_B64 = 800_000;       // ~600 Ko bruts : au-delà, c'est du raster embarqué
export const PNG_MAX_B64 = 1_200_000;     // cible PNG ; on descend l'échelle jusqu'à passer
export const PNG_SCALES = [2, 1, 0.5] as const;

export function chooseFormat(svgB64Len: number, svgMax = SVG_MAX_B64): 'svg' | 'png' {
  return svgB64Len <= svgMax ? 'svg' : 'png';
}
```
Run: `npm run test:run -- src/renderFormat.test.ts` → PASS.

- [ ] **Step 3 : `types.ts` — message**

Dans `plugin/src/types.ts` ligne 73, ajouter `render_kind` :
```ts
  | { type: 'SNAPSHOT_READY'; snapshot: FigmaSnapshot; nodeId: string; render_svg_b64?: string; render_kind?: 'svg' | 'png' }
```

- [ ] **Step 4 : `store.ts` — état + setSnapshot**

Dans `plugin/src/store.ts` :
- ligne ~29 (à côté de `renderSvgB64: string | undefined`) ajouter :
```ts
  renderKind: 'svg' | 'png' | undefined
```
- ligne ~42 signature `setSnapshot` :
```ts
  setSnapshot:    (s: FigmaSnapshot | null, svg?: string, kind?: 'svg' | 'png') => void
```
- ligne ~58 défaut : ajouter `renderKind: undefined,`
- ligne ~76 implémentation :
```ts
  setSnapshot:    (snapshot, renderSvgB64, renderKind) => set({ snapshot, renderSvgB64, renderKind }),
```

- [ ] **Step 5 : `main.ts` — export adaptatif**

Dans `plugin/src/main.ts`, ajouter en tête l'import :
```ts
import { chooseFormat, PNG_MAX_B64, PNG_SCALES } from './renderFormat';
```
Remplacer le bloc actuel (lignes ~497-516, du commentaire `// Pixel-perfect SVG…` jusqu'au `send({ type: 'SNAPSHOT_READY', … })` inclus) par :
```ts
  // Aperçu : SVG si vectoriel léger (zoom net), sinon PNG borné (raster/lourd, échelle dégressive).
  let render_svg_b64: string | undefined;
  let render_kind: 'svg' | 'png' = 'svg';
  if ('exportAsync' in node) {
    const exportNode = node as ExportMixin;
    const toB64 = (bytes: Uint8Array): string => {
      const CHUNK = 8192; let b = '';
      for (let i = 0; i < bytes.length; i += CHUNK) b += String.fromCharCode(...Array.from(bytes.slice(i, Math.min(i + CHUNK, bytes.length))));
      return btoa(b);
    };
    try {
      const svgB64 = toB64(await exportNode.exportAsync({ format: 'SVG' }));
      if (chooseFormat(svgB64.length) === 'svg') {
        render_svg_b64 = svgB64; render_kind = 'svg';
      } else {
        for (const s of PNG_SCALES) {
          render_svg_b64 = toB64(await exportNode.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: s } }));
          render_kind = 'png';
          if (render_svg_b64.length <= PNG_MAX_B64 || s === 0.5) break;
        }
      }
      console.log('[DG] render', render_kind, render_svg_b64?.length, 'b64 chars');
    } catch (e) {
      console.log('[DG] export failed:', e);
    }
  }
  send({ type: 'SNAPSHOT_READY', snapshot: figmaSnapshot, nodeId: node.id, render_svg_b64, render_kind });
```

- [ ] **Step 6 : `main.ts` — garde restore (ne pas reconstruire un PNG en SVG)**

Dans `handleRestoreToFigma` (≈ ligne 346), juste après la signature, neutraliser un render PNG (le fallback `createNodeFromSvg` exige du SVG ; pour un PNG on s'appuie sur le clone `dg_history` / `applyDeltaProps` comme avant) :
```ts
async function handleRestoreToFigma(versionId: string | undefined, snapshot: FigmaSnapshot, renderSvgB64?: string): Promise<void> {
  if (renderSvgB64 && renderSvgB64.startsWith('iVBO')) renderSvgB64 = undefined; // PNG → pas de createNodeFromSvg
```
(Le reste de la fonction — branche `if (!renderSvgB64)` puis `createNodeFromSvg` — est inchangé.)

- [ ] **Step 7 : `ui.tsx` — propager le kind**

- ligne ~105 : à côté de `const setSnapshot = useAppStore(s => s.setSnapshot);` rien à changer.
- ligne ~130 :
```ts
        case 'SNAPSHOT_READY': setSnapshot(msg.snapshot, msg.render_svg_b64, msg.render_kind); setScreen('checkpoint'); break;
```
- ligne ~445 : à côté de `const renderSvgB64 = useAppStore(s => s.renderSvgB64);` ajouter :
```ts
  const renderKind = useAppStore(s => s.renderKind);
```
- ligne ~468 (corps POST `/api/checkpoints`) : ajouter après `render_svg_b64:  renderSvgB64,` :
```ts
            render_kind:     renderKind,
```
- ligne ~478 : ajouter `renderKind` au tableau de deps du `useCallback`.
- ligne ~545 : **supprimer** la ligne du warning (le rendu est désormais toujours présent) :
```ts
          {!renderSvgB64 && <p class="text-xs text-amber-600/80 mt-1">Frame complexe — aperçu approximatif activé</p>}
```

- [ ] **Step 8 : Vérifier + commit**

Run (depuis `plugin/`): `npm run typecheck && npm run test:run && npm run build`
Expected : typecheck clean ; tests verts (dont `renderFormat`) ; build OK.
```bash
git add plugin/src/renderFormat.ts plugin/src/renderFormat.test.ts plugin/src/main.ts plugin/src/types.ts plugin/src/store.ts plugin/src/ui.tsx
git commit -m "feat(plugin): adaptive render format — SVG when light, bounded PNG otherwise"
```

---

## Task A2 : Backend — accepter `render_kind` + stocker sous la bonne clé

**Files:** Modify `backend/src/types/api.ts`, `backend/src/controllers/checkpoints.controller.ts`, `backend/src/services/versioning.service.ts`, `backend/src/tests/versioning.service.test.ts`

**Interfaces consommées :** POST `/api/checkpoints` reçoit `render_kind?: 'svg'|'png'`. **Produit :** `_render.json` contient `{ png_b64 }` (kind png) ou `{ svg_b64 }` (kind svg) — `resolveRenderB64` lit déjà les deux.

- [ ] **Step 1 : Test qui échoue**

Dans `backend/src/tests/versioning.service.test.ts`, ajouter un test vérifiant le stockage sous `png_b64` quand `renderKind:'png'`. Réutiliser le harness existant du fichier (mêmes stubs `db`/`storage` que les tests présents) ; le cœur : capter l'argument d'upload du `_render.json` et asserter la clé.
```ts
it('stocke le render PNG sous png_b64', async () => {
  // … construire db/storage stubs comme les autres tests du fichier,
  //    avec un upload espionné pour _render.json …
  // Appel createVersionAtomic avec renderB64:'iVBOxxx', renderKind:'png'
  // Asserter que le contenu uploadé pour *_render.json parse en { png_b64: 'iVBOxxx' }
});
```
> Note implémenteur : calque-toi sur le test d'upload existant le plus proche dans ce fichier ; espionne `storage.from().upload` et, pour l'appel dont le chemin finit par `_render.json`, parse le `Buffer`/contenu et vérifie `JSON.parse(...).png_b64 === 'iVBOxxx'`. Ajoute le pendant `svg_b64` pour `renderKind:'svg'`.

Run (depuis `backend/`): `npm run test:run -- src/tests/versioning.service.test.ts` → FAIL.

- [ ] **Step 2 : `api.ts` — schéma**

Dans `backend/src/types/api.ts`, `createCheckpointSchema`, après `render_svg_b64: z.string().optional(),` :
```ts
  render_kind: z.enum(['svg', 'png']).optional(),
```

- [ ] **Step 3 : `checkpoints.controller.ts` — passer le kind**

Ligne ~64, à côté de `renderB64: body.render_svg_b64 ?? null,` ajouter :
```ts
    renderKind: body.render_kind ?? 'svg',
```

- [ ] **Step 4 : `versioning.service.ts` — type + stockage**

Dans le type `CreateVersionInput` (mêmes champs que les autres), ajouter :
```ts
  renderKind?: 'svg' | 'png';
```
Remplacer la ligne d'emballage (≈ 86) :
```ts
        const renderBytes = Buffer.from(JSON.stringify({ svg_b64: input.renderB64 }));
```
par :
```ts
        const renderBytes = Buffer.from(JSON.stringify(
          input.renderKind === 'png' ? { png_b64: input.renderB64 } : { svg_b64: input.renderB64 },
        ));
```
(Le `contentType:'application/json'` et le `_render.json` restent inchangés — transport = Plan B.)

- [ ] **Step 5 : Vérifier + commit**

Run (depuis `backend/`): `npm run typecheck && npm run test:run`
Expected : typecheck clean ; suite verte (dont le nouveau test).
```bash
git add backend/src/types/api.ts backend/src/controllers/checkpoints.controller.ts backend/src/services/versioning.service.ts backend/src/tests/versioning.service.test.ts
git commit -m "feat(checkpoints): store render under png_b64/svg_b64 per render_kind"
```

---

## Self-Review

**Spec coverage (portion FORMAT) :** capture adaptative SVG/PNG → A1 ✅ ; seuils 800 Ko / 1,2 Mo / 2-1-0,5 → A1 ✅ ; `render_kind` bout-en-bout (message→store→POST→schéma→stockage) → A1+A2 ✅ ; restore non régressé (PNG → pas de `createNodeFromSvg`, clone inchangé) → A1 step 6 ✅. **Transport blob+URL + crops CSS + bbox = Plan B (hors de ce plan, volontaire).**

**Placeholders :** code complet partout sauf le harness du test A2-step1 qui renvoie au pattern d'upload existant du fichier (les stubs y sont déjà ; les dupliquer à l'aveugle serait fragile) — l'assertion exacte (`png_b64 === 'iVBOxxx'`) est donnée.

**Type consistency :** `render_kind`/`renderKind: 'svg'|'png'` cohérent (types.ts, store.ts, ui.tsx, api.ts, checkpoints, versioning) ; `chooseFormat` même signature (renderFormat.ts ↔ test ↔ main.ts) ; champ `render_svg_b64` conservé partout (porte svg **ou** png b64).

**Non régression :** l'UI rend déjà le PNG (`iVBO` → `<img>`), donc aucun changement d'affichage requis. `resolveRenderB64` lit déjà `svg_b64 ?? png_b64`. Les crops par-nœud d'une frame PNG retombent sur la reconstruction existante (lossy) — acceptable en Plan A ; corrigé en Plan B (crops CSS).
