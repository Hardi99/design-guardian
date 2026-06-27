# Render — Transport blob binaire + URL signée (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Remplacer le rendu d'aperçu base64-dans-JSON (`_render.json`) par un **blob binaire** (`_render.png`/`_render.svg`) servi en **URL signée**, consommé par l'UI en `<img>` (PNG) ou SVG inline (vectoriel → zoom net), pour un aperçu rapide, caché par le navigateur et fiable.

**Architecture :** Phase 2 de la spec `2026-06-27-render-pipeline-png-blob-design.md` (le format adaptatif = Plan A déjà mergé). On procède **incrémentalement non-cassant** : (B1) stockage binaire + lecture compatible ; (B2) on AJOUTE `render_url`/`render_kind` à côté de `svg_b64` ; (B3) l'UI bascule sur l'URL (SVG inline crisp / PNG `<img>`) + continuité restore ; (B4) on retire `svg_b64` inline. **Crops par-nœud CSS = Plan C (différé).**

**Tech Stack :** Backend Hono + Supabase Storage + Vitest ; plugin Preact + Vitest.

## Global Constraints
- TS strict **zéro `any`**. `figma.*` uniquement `main.ts` ; HTTP uniquement `ui.tsx`.
- **Non-cassant à chaque tâche** : la suite reste verte et le diff-viewer fonctionne après chaque commit.
- Bucket `snapshots` privé → **URL signées** (TTL 3600 s). Nom des blobs : `{path-sans-.json}_render.png` ou `_render.svg`.
- Backend : `npm run typecheck && npm run test:run` (depuis `backend/`). Plugin : `npm run typecheck && npm test && npm run build` (depuis `plugin/`).
- **Stage uniquement** les fichiers de la tâche (jamais `.devcontainer/`). Commits finis par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure
- `backend/src/services/versioning.service.ts` — stockage blob binaire (B1) ; retrait emballage JSON (B4).
- `backend/src/controllers/branches.controller.ts` — `resolveRenderB64` lit le blob (B1) ; `resolveRenderUrl` + payload `render_url`/`render_kind` (B2) ; retrait `svg_b64` inline (B4) ; copie render au restore (B1).
- `backend/src/types/api.ts` + `services/openapi.ts` — champs `render_url`/`render_kind` (B2).
- `plugin/src/diffReducer.ts` — type `DiffData` (B3).
- `plugin/src/ui.tsx` — `SvgFrame`/Split/Overlay consomment `{url,kind}` ; continuité restore (B3).

---

## Task B1 : Stockage blob binaire (+ lecture compatible, non-cassant)

**Files:** Modify `backend/src/services/versioning.service.ts`, `backend/src/controllers/branches.controller.ts` · Test `backend/src/tests/versioning.service.test.ts`

**But :** stocker le rendu en **blob binaire** `_render.{png,svg}` (au lieu de `{svg_b64}`-JSON), et faire en sorte que la lecture existante (`resolveRenderB64`, qui peuple encore `svg_b64`) lise le blob **et** l'ancien `_render.json` (rétro-compat). Le diff-viewer continue de marcher à l'identique.

**Interfaces produites :** `_render.png`/`_render.svg` (binaire) ; `resolveRenderB64` retourne toujours un b64 (lu depuis blob ou legacy).

- [ ] **Step 1 : Test qui échoue — stockage binaire**

Dans `backend/src/tests/versioning.service.test.ts`, adapter/ajouter un test : `renderKind:'png'` → upload de `…_render.png` avec `contentType:'image/png'` et **octets bruts** (pas de JSON). Calque-toi sur le test d'upload existant (espionne `storage.from().upload`, vérifie le chemin `_render.png`, `contentType:'image/png'`, et que le `Buffer` uploadé `=== Buffer.from('iVBOxxx','base64')`). Idem `svg` → `_render.svg`, `image/svg+xml`.
Run (depuis `backend/`): `npm run test:run -- src/tests/versioning.service.test.ts` → FAIL.

- [ ] **Step 2 : Implémenter le stockage binaire**

Dans `versioning.service.ts`, remplacer le bloc d'upload du rendu (≈ lignes 81-88) :
```ts
    const ext   = input.renderKind === 'png' ? 'png' : 'svg';
    const ctype = input.renderKind === 'png' ? 'image/png' : 'image/svg+xml';
    const renderPath = path.replace('.json', `_render.${ext}`);
    try {
      const meta = await input.computeMeta(prevTyped);

      if (input.renderB64) {
        await storage.from(SNAPSHOTS_BUCKET).upload(renderPath, Buffer.from(input.renderB64, 'base64'), { contentType: ctype, upsert: true });
      }
```
Adapter le cleanup orphelin du `catch`/sortie anormale : retirer le blob `renderPath` (`_render.${ext}`) au lieu de `_render.json`.
Run: `npm run test:run -- src/tests/versioning.service.test.ts` → PASS.

- [ ] **Step 3 : `resolveRenderB64` lit le blob (+ legacy)**

Dans `branches.controller.ts`, remplacer le corps de `resolveRenderB64` (≈ 84-98) pour lire d'abord les blobs binaires, puis l'ancien `_render.json`, puis la reconstruction :
```ts
  const resolveRenderB64 = async (storagePath: string | null, snapshot: FigmaSnapshot | null): Promise<string | null> => {
    if (storagePath) {
      const store = getSupabaseStorage().from(SNAPSHOTS_BUCKET);
      for (const ext of ['png', 'svg'] as const) {
        const { data } = await store.download(storagePath.replace('.json', `_render.${ext}`));
        if (data) return Buffer.from(await data.arrayBuffer()).toString('base64');
      }
      // legacy : ancien rendu enveloppé en JSON
      const { data: legacy } = await store.download(storagePath.replace('.json', '_render.json'));
      if (legacy) {
        try {
          const json = JSON.parse(await legacy.text()) as { svg_b64?: string; png_b64?: string };
          if (json.svg_b64) return json.svg_b64;
          if (json.png_b64) return json.png_b64;
        } catch { /* fallback */ }
      }
    }
    return toFullSvgB64(snapshot);
  };
```

- [ ] **Step 4 : Copie du rendu au restore (binaire)**

Dans le contrôleur restore (≈ lignes 271-281), copier le blob binaire de la source vers la nouvelle version. Remplacer par une boucle sur les deux extensions :
```ts
  if (src.storage_path && version.storage_path) {
    const store = storage.from(SNAPSHOTS_BUCKET);
    for (const ext of ['png', 'svg'] as const) {
      const { data: renderData } = await store.download(src.storage_path.replace('.json', `_render.${ext}`));
      if (renderData) {
        const ctype = ext === 'png' ? 'image/png' : 'image/svg+xml';
        await store.upload(version.storage_path.replace('.json', `_render.${ext}`), await renderData.arrayBuffer(), { contentType: ctype, upsert: true });
        break;
      }
    }
  }
```

- [ ] **Step 5 : Vérifier + commit**

Run (depuis `backend/`): `npm run typecheck && npm run test:run` → vert.
```bash
git add backend/src/services/versioning.service.ts backend/src/controllers/branches.controller.ts backend/src/tests/versioning.service.test.ts
git commit -m "feat(render): store render as binary blob (_render.png/.svg), read-compatible"
```

---

## Task B2 : Ajouter `render_url` + `render_kind` au payload diff (non-cassant)

**Files:** Modify `backend/src/controllers/branches.controller.ts`, `backend/src/types/api.ts`, `backend/src/services/openapi.ts` · Test : couvert par l'intégration existante du fichier de tests des controllers si présent ; sinon assertion ciblée.

**But :** AJOUTER `render_url`/`render_kind` (URL signée du blob) au payload, **sans retirer** `svg_b64`/`prev_svg_b64` (l'UI bascule en B3). Mint d'URL = pas de download (rapide).

**Interfaces produites :** payload diff gagne `render_url`/`render_kind`/`prev_render_url`/`prev_render_kind` (`string|null`).

- [ ] **Step 1 : `resolveRenderUrl` (URL signée + rétro-compat data-URL)**

Dans `branches.controller.ts`, ajouter à côté de `resolveRenderB64` :
```ts
  const resolveRenderUrl = async (storagePath: string | null, snapshot: FigmaSnapshot | null): Promise<{ url: string; kind: 'svg' | 'png' } | null> => {
    if (storagePath) {
      const store = getSupabaseStorage().from(SNAPSHOTS_BUCKET);
      for (const kind of ['png', 'svg'] as const) {
        const { data } = await store.createSignedUrl(storagePath.replace('.json', `_render.${kind}`), 3600);
        if (data?.signedUrl) return { url: data.signedUrl, kind };
      }
      const { data: legacy } = await store.download(storagePath.replace('.json', '_render.json'));
      if (legacy) {
        try {
          const j = JSON.parse(await legacy.text()) as { svg_b64?: string; png_b64?: string };
          if (j.png_b64) return { url: `data:image/png;base64,${j.png_b64}`, kind: 'png' };
          if (j.svg_b64) return { url: `data:image/svg+xml;base64,${j.svg_b64}`, kind: 'svg' };
        } catch { /* fallback */ }
      }
    }
    const recon = toFullSvgB64(snapshot);
    return recon ? { url: `data:image/svg+xml;base64,${recon}`, kind: 'svg' } : null;
  };
```
(`createSignedUrl` renvoie `data:null` si l'objet n'existe pas → on essaie png puis svg.)

- [ ] **Step 2 : Résoudre les URLs (sur `?thumbs=1`, comme les b64) + payload**

Après le bloc `[svgB64, prevSvgB64] = wantThumbs ? … : [null, null]`, ajouter :
```ts
  const [curUrl, prevUrl] = wantThumbs
    ? await Promise.all([
        resolveRenderUrl(versionData.storage_path, currentSnap),
        resolveRenderUrl(prevVersion?.storage_path ?? null, prevSnap),
      ])
    : [null, null];
```
Dans le `c.json({...})` final, ajouter (à côté de `svg_b64`/`prev_svg_b64`, qu'on garde pour l'instant) :
```ts
    render_url: curUrl?.url ?? null,        render_kind: curUrl?.kind ?? null,
    prev_render_url: prevUrl?.url ?? null,  prev_render_kind: prevUrl?.kind ?? null,
```

- [ ] **Step 3 : OpenAPI + commit**

Dans `openapi.ts`, ajouter les 4 champs `render_url`/`render_kind`/`prev_render_url`/`prev_render_kind` (`type:'string', nullable:true`) au schéma de réponse du diff (à côté de `svg_b64`).
Run (depuis `backend/`): `npm run typecheck && npm run test:run` → vert.
```bash
git add backend/src/controllers/branches.controller.ts backend/src/services/openapi.ts
git commit -m "feat(render): expose signed render_url + render_kind in diff payload"
```

---

## Task B3 : UI — consommer l'URL (SVG inline crisp / PNG `<img>`) + continuité restore

**Files:** Modify `plugin/src/diffReducer.ts`, `plugin/src/ui.tsx`

**But :** `SvgFrame` (Split/Overlay) consomme `{ url, kind }` : **SVG → fetch + inline** (zoom vectoriel net préservé), **PNG → `<img src=url>`**. Le restore récupère le SVG depuis l'URL quand `kind==='svg'` (pour `createNodeFromSvg`), rien pour PNG (clone `dg_history`).

**Interfaces consommées :** payload `render_url`/`render_kind`/`prev_render_url`/`prev_render_kind`.

- [ ] **Step 1 : Type `DiffData`**

Dans `plugin/src/diffReducer.ts` (`interface DiffData`, ≈ 32-41), remplacer `svg_b64`/`prev_svg_b64` par :
```ts
  render_url:        string | null
  render_kind:       'svg' | 'png' | null
  prev_render_url:   string | null
  prev_render_kind:  'svg' | 'png' | null
```

- [ ] **Step 2 : Composant d'aperçu par URL**

Dans `ui.tsx`, remplacer la signature et la source de `SvgFrame` : elle prend `{ url, kind, style, zoomable }` au lieu de `b64`. Pour `kind==='svg'`, charger le texte (fetch — `ui.tsx` est le thread HTTP) et l'inliner ; pour `'png'`, `<img src={url}>`. Conserver tout le wrapper zoom/pan existant (lignes 893-939 inchangées, seul `content` change).
```tsx
function SvgFrame({ url, kind, style, zoomable }: { url: string; kind: 'svg' | 'png'; style?: string; zoomable?: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== 'svg') return;
    let alive = true;
    fetch(url).then(r => r.text()).then(t => { if (alive) setSvg(
      t.replace(/(<svg[^>]*)\s+(?:width|height)="[^"]*"/g, '$1')
       .replace('<svg', '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet"')
    ); }).catch(() => { if (alive) setSvg(''); });
    return () => { alive = false; };
  }, [url, kind]);

  const content = kind === 'png'
    ? <img src={url} class="w-full h-full object-contain" style={{ pointerEvents: 'none' }} />
    : svg === null
      ? <div class="w-full h-full animate-pulse bg-gray-800/40" />            /* skeleton pendant le fetch */
      : svg
        ? <div class="w-full h-full" style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: svg }} />
        : <p class="text-gray-600 text-xs">Erreur rendu</p>;
  // … reste identique (if (!zoomable) return …; wrapper zoom/pan avec {content}) …
}
```
(Garder le corps zoom/pan tel quel ; seul le calcul de `content` et la signature changent.)

- [ ] **Step 3 : Split/Overlay appellent par URL**

Aux ≈ lignes 775-791, remplacer les usages `data.prev_svg_b64`/`data.svg_b64` :
- Split : `{data.prev_render_url ? <SvgFrame url={data.prev_render_url} kind={data.prev_render_kind ?? 'png'} style="flex-1 min-h-0 overflow-hidden" zoomable /> : <p class="text-gray-600 text-xs">Pas de visuel</p>}` (idem pour `render_url`).
- Overlay (790-791) : `{data.prev_render_url && <div class="absolute inset-0 p-4" style={{ opacity: 1 - opacity }}><SvgFrame url={data.prev_render_url} kind={data.prev_render_kind ?? 'png'} style="w-full h-full" /></div>}` (idem `render_url`).

- [ ] **Step 4 : Continuité restore**

`useApplyToFigma` reçoit aujourd'hui `state.data?.svg_b64`. Le remplacer par une récupération du SVG à la demande : ne passer un render à `RESTORE_TO_FIGMA` **que si** `render_kind==='svg'`, en fetchant le texte depuis `render_url` ; sinon `undefined` (le clone `dg_history`/`applyDeltaProps` gère le PNG). Modifier le hook (≈ 611-655) :
```ts
// au lieu de svgB64 fixe, passer url+kind ; dans applyToFigma :
const renderSvg = (kind === 'svg' && url) ? await fetch(url).then(r => r.text()).catch(() => undefined) : undefined;
send({ type: 'RESTORE_TO_FIGMA', versionId, snapshot, render_svg_b64: renderSvg, delta: delta ?? undefined });
```
Adapter l'appelant (≈ 655) pour passer `state.data?.render_url` + `state.data?.render_kind` au lieu de `state.data?.svg_b64`. (`RESTORE_TO_FIGMA.render_svg_b64` reçoit désormais du **texte SVG**, pas du b64 — `main.ts handleRestoreToFigma` fait déjà `decodeBase64Utf8`… ⚠️ vérifier : si le champ porte du SVG brut, ajuster `main.ts` pour accepter du SVG texte direct, ou ré-encoder en b64 côté UI : `btoa(unescape(encodeURIComponent(svgText)))` pour rester compatible avec `decodeBase64Utf8`.) **Choix retenu :** ré-encoder en base64 côté UI pour ne PAS toucher `main.ts` :
```ts
const renderSvg = (kind === 'svg' && url)
  ? await fetch(url).then(r => r.text()).then(t => btoa(unescape(encodeURIComponent(t)))).catch(() => undefined)
  : undefined;
```

- [ ] **Step 5 : Vérifier + commit**

Run (depuis `plugin/`): `npm run typecheck && npm test && npm run build` → vert (le diff-viewer affiche les frames via URL ; SVG net, PNG net).
```bash
git add plugin/src/diffReducer.ts plugin/src/ui.tsx
git commit -m "feat(plugin): diff viewer consumes signed render_url (svg inline / png img) + restore continuity"
```

---

## Task B4 : Cleanup — retirer `svg_b64` inline du payload

**Files:** Modify `backend/src/controllers/branches.controller.ts`, `backend/src/services/openapi.ts`

**But :** maintenant que l'UI utilise `render_url`, retirer les gros `svg_b64`/`prev_svg_b64` du payload (le poids qu'on voulait éliminer). On **garde** `resolveRenderB64` (utilisé par les crops par-nœud `toNodeSvgB64`).

- [ ] **Step 1 : Retirer les champs**

Dans le `c.json({...})` final, supprimer `svg_b64: svgB64, prev_svg_b64: prevSvgB64`. `svgB64`/`prevSvgB64` restent calculés (servent encore aux crops `toNodeSvgB64`). Retirer les 2 champs correspondants dans `openapi.ts`.

- [ ] **Step 2 : Vérifier + commit**

Run (depuis `backend/`): `npm run typecheck && npm run test:run` → vert.
Run (depuis `plugin/`): `npm run typecheck && npm test` → vert (l'UI n'utilise plus `svg_b64`).
```bash
git add backend/src/controllers/branches.controller.ts backend/src/services/openapi.ts
git commit -m "refactor(render): drop inline svg_b64 from diff payload (served via signed URL)"
```

---

## Self-Review

**Spec coverage (Phase 2) :** stockage blob binaire → B1 ✅ ; URL signée → B2 ✅ ; UI `<img>`/SVG inline net → B3 ✅ ; rétro-compat (_render.json data-URL + reconstruction) → B1/B2 ✅ ; continuité restore (copie blob + fetch SVG côté restore, PNG → clone) → B1 step4 + B3 step4 ✅ ; **crops par-nœud CSS = Plan C (différé, assumé)**.

**Non-cassant :** B1 garde la lecture b64 (blob+legacy) → diff-viewer inchangé ; B2 ajoute sans retirer ; B3 bascule l'UI ; B4 nettoie. Chaque commit laisse la suite verte et l'app fonctionnelle.

**Placeholders :** code complet sauf les renames mécaniques `svg_b64→render_url` aux points listés (fichiers+lignes précis) et le test B2 (renvoyé au pattern d'intégration existant). Le ⚠️ du B3 step4 est tranché (ré-encodage b64 côté UI, `main.ts` non touché).

**Type consistency :** `render_url`/`render_kind` (`'svg'|'png'|null`) cohérent backend (payload, openapi) ↔ plugin (`DiffData`, `SvgFrame {url,kind}`). `resolveRenderB64` (b64, pour crops) et `resolveRenderUrl` (URL, pour frames) coexistent. Champ message `RESTORE_TO_FIGMA.render_svg_b64` inchangé (reçoit du b64 — l'UI ré-encode le SVG fetché).

**YAGNI / différé :** crops par-nœud CSS (Plan C), upload direct plugin→Storage, REST/OAuth.
