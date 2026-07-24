# Diff-viewer Frame-héros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Remplacer les deux listes parallèles du diff-viewer par **une frame surlignée + détail au clic** (héros = Frame), avec toggle Avant/Après et chips (modifiés/ajoutés/supprimés/dérivés).

**Architecture :** Refonte **UI pure** (zéro backend). On extrait 3 composants — `HighlightCanvas`, `NodeDetail`, `DiffChips` — pilotés par un helper pur `buildHighlights`. Le corps de `DiffScreen` est réassemblé ; les cartes Nodes / liste Smart Data / blocs / onglets Split-Overlay sont retirés.

**Tech Stack :** Preact + hooks + Tailwind + Vitest. Plugin `plugin/`.

**Spec :** `docs/superpowers/specs/2026-06-28-diff-viewer-frame-hero-design.md`.

## Global Constraints
- **Zéro backend** : tout vient du payload diff existant (`render_url`/`render_kind`, `prev_render_url`/`prev_render_kind`, `current_frame`/`prev_frame`, `node_diffs[*]` avec `before_bbox`/`after_bbox`/`significance`/`kind`/`readable`).
- TS strict **zéro `any`**. `figma.*` interdit dans `ui.tsx` (DOM/CSS/fetch OK).
- Surlignage = transform **fit/contain** : `scale = min(CW/FW, CH/FH)`, image centrée ; un highlight au `bbox` → `left=offX+x*scale, top=offY+y*scale, w=w*scale, h=h*scale`.
- Tones : `modified`=violet, `added`=vert, `removed`=rouge, `derived`=gris.
- Vérif (depuis `plugin/`): `npm run typecheck && npm test && npm run build` — tout vert.
- **Stage uniquement** les fichiers de la tâche (jamais `.devcontainer/`). Commits finis par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure
- Create `plugin/src/diffHighlights.ts` — helper pur `buildHighlights` + types `Highlight`/`Tone`.
- Create `plugin/src/diffHighlights.test.ts`.
- Modify `plugin/src/ui.tsx` — `FrameImage` (extrait d'`SvgFrame`), `HighlightCanvas`, `NodeDetail`, `DiffChips`, refonte du corps de `DiffScreen`, retraits.

---

## Task 1 : Helper pur `buildHighlights`

**Files:** Create `plugin/src/diffHighlights.ts`, `plugin/src/diffHighlights.test.ts`

**Interfaces produites :**
- `type Tone = 'modified' | 'added' | 'removed' | 'derived'`
- `interface Highlight { nodeId: string; bbox: Bbox; tone: Tone }`
- `buildHighlights(nodeDiffs: NodeDiffVisual[], beforeMode: boolean, showDerived: boolean): Highlight[]`

- [ ] **Step 1 : Test qui échoue**

Create `plugin/src/diffHighlights.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { buildHighlights } from './diffHighlights';
import type { NodeDiffVisual } from './diffReducer';

const bb = { x: 0, y: 0, w: 10, h: 10 };
const nd = (over: Partial<NodeDiffVisual>): NodeDiffVisual => ({
  nodeId: 'n', nodeName: 'n', nodeType: 'RECTANGLE', changes: [],
  kind: 'modified', significance: 'notable', before_bbox: bb, after_bbox: bb, ...over,
});

describe('buildHighlights', () => {
  it('après : modified+added avec after_bbox ; removed (pas d\'after_bbox) exclu', () => {
    const h = buildHighlights([
      nd({ nodeId: 'm', kind: 'modified' }),
      nd({ nodeId: 'a', kind: 'added', before_bbox: null }),
      nd({ nodeId: 'r', kind: 'removed', after_bbox: null }),
    ], false, false);
    expect(h.map(x => `${x.nodeId}:${x.tone}`)).toEqual(['m:modified', 'a:added']);
  });

  it('avant : modified+removed avec before_bbox ; added exclu', () => {
    const h = buildHighlights([
      nd({ nodeId: 'm', kind: 'modified' }),
      nd({ nodeId: 'a', kind: 'added', before_bbox: null }),
      nd({ nodeId: 'r', kind: 'removed', after_bbox: null }),
    ], true, false);
    expect(h.map(x => `${x.nodeId}:${x.tone}`)).toEqual(['m:modified', 'r:removed']);
  });

  it('dérivés exclus par défaut, inclus (tone derived) si showDerived', () => {
    const nodes = [nd({ nodeId: 'm' }), nd({ nodeId: 'd', significance: 'minor' })];
    expect(buildHighlights(nodes, false, false).map(x => x.nodeId)).toEqual(['m']);
    const withD = buildHighlights(nodes, false, true);
    expect(withD.map(x => `${x.nodeId}:${x.tone}`)).toEqual(['m:modified', 'd:derived']);
  });
});
```
Run (depuis `plugin/`): `npm test -- diffHighlights` → FAIL.

- [ ] **Step 2 : Implémenter**

Create `plugin/src/diffHighlights.ts` :
```ts
import type { Bbox, NodeDiffVisual } from './diffReducer';

export type Tone = 'modified' | 'added' | 'removed' | 'derived';
export interface Highlight { nodeId: string; bbox: Bbox; tone: Tone }

export function buildHighlights(nodeDiffs: NodeDiffVisual[], beforeMode: boolean, showDerived: boolean): Highlight[] {
  const pool = showDerived ? nodeDiffs : nodeDiffs.filter(n => n.significance !== 'minor');
  const out: Highlight[] = [];
  for (const n of pool) {
    const bbox = beforeMode ? n.before_bbox : n.after_bbox;
    if (!bbox) continue;
    const tone: Tone = n.significance === 'minor' ? 'derived' : n.kind;
    out.push({ nodeId: n.nodeId, bbox, tone });
  }
  return out;
}
```
Run: `npm test -- diffHighlights` → PASS. (Vérifier que `Bbox` est bien exporté depuis `diffReducer.ts` ; il l'est.)

- [ ] **Step 3 : typecheck + commit**
```bash
npm run typecheck
git add plugin/src/diffHighlights.ts plugin/src/diffHighlights.test.ts
git commit -m "feat(diff): pure buildHighlights helper for frame-hero canvas"
```

---

## Task 2 : `FrameImage` (rendu image réutilisable, extrait d'`SvgFrame`)

**Files:** Modify `plugin/src/ui.tsx`

**Interfaces produites :** `function FrameImage({ url, kind }: { url: string; kind: 'svg' | 'png' }): JSX.Element` — rend l'image en **fit/contain centré** (png `<img object-contain>` ; svg fetch+inline), SANS zoom/pan.

- [ ] **Step 1 : Ajouter `FrameImage`**

Dans `ui.tsx`, ajouter ce composant (réutilise la logique de fetch SVG d'`SvgFrame`) :
```tsx
function FrameImage({ url, kind }: { url: string; kind: 'svg' | 'png' }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== 'svg') { setSvg(null); return; }
    let alive = true;
    setSvg(null);
    fetch(url).then(r => r.text()).then(t => { if (alive) setSvg(
      t.replace(/(<svg[^>]*)\s+(?:width|height)="[^"]*"/g, '$1')
       .replace('<svg', '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet"')
    ); }).catch(() => { if (alive) setSvg(''); });
    return () => { alive = false; };
  }, [url, kind]);
  if (kind === 'png') return <img src={url} class="w-full h-full object-contain" style={{ pointerEvents: 'none' }} />;
  if (svg === null) return <div class="w-full h-full animate-pulse bg-gray-800/40" />;
  if (!svg) return <p class="text-gray-600 text-xs">Erreur rendu</p>;
  return <div class="w-full h-full" style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

- [ ] **Step 2 : Vérif + commit**
Run: `npm run typecheck && npm run build` → OK (composant non encore utilisé, mais doit compiler).
```bash
git add plugin/src/ui.tsx
git commit -m "feat(diff): FrameImage (fit/contain frame render, no zoom)"
```

---

## Task 3 : `HighlightCanvas`

**Files:** Modify `plugin/src/ui.tsx`

**Interfaces consommées :** `FrameImage` (T2), `Highlight` (T1).
**Produites :** `function HighlightCanvas({ url, kind, frame, highlights, selectedId, onSelect })`.

- [ ] **Step 1 : Ajouter `HighlightCanvas`**

```tsx
import { buildHighlights, type Highlight } from './diffHighlights.js'; // en tête de ui.tsx

const TONE_CLASS: Record<Highlight['tone'], string> = {
  modified: 'border-purple-400',
  added:    'border-green-400',
  removed:  'border-red-400',
  derived:  'border-gray-500/50',
};

function HighlightCanvas({ url, kind, frame, highlights, selectedId, onSelect }: {
  url: string; kind: 'svg' | 'png'; frame: { w: number; h: number };
  highlights: Highlight[]; selectedId: string | null; onSelect: (id: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const scale = box.w > 0 && frame.w > 0 && frame.h > 0 ? Math.min(box.w / frame.w, box.h / frame.h) : 0;
  const offX = (box.w - frame.w * scale) / 2;
  const offY = (box.h - frame.h * scale) / 2;
  return (
    <div ref={ref} class="relative flex-1 min-h-0 overflow-hidden" onClick={() => onSelect(null)}>
      <FrameImage url={url} kind={kind} />
      {scale > 0 && highlights.map(hl => (
        <button key={hl.nodeId}
          aria-label={`Voir le changement de ${hl.nodeId}`}
          onClick={(e) => { e.stopPropagation(); onSelect(hl.nodeId); }}
          class={`absolute border-2 rounded-sm transition-colors ${TONE_CLASS[hl.tone]} ${selectedId === hl.nodeId ? 'ring-2 ring-white/70 bg-white/5' : 'hover:bg-white/5'}`}
          style={{ left: `${offX + hl.bbox.x * scale}px`, top: `${offY + hl.bbox.y * scale}px`, width: `${Math.max(6, hl.bbox.w * scale)}px`, height: `${Math.max(6, hl.bbox.h * scale)}px` }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2 : Vérif + commit**
Run: `npm run typecheck && npm run build` → OK.
```bash
git add plugin/src/ui.tsx
git commit -m "feat(diff): HighlightCanvas — clickable change highlights over the frame"
```

---

## Task 4 : `NodeDetail`

**Files:** Modify `plugin/src/ui.tsx`

**But :** détail du nœud sélectionné — crops avant/après (réutilise `NodeCrop`) + la liste `readable`. Réutiliser le rendu `readable` actuellement dans `NodeDiffCard` (le mapper sur `nd.readable`).

**Interfaces produites :** `function NodeDetail({ node, renderUrl, prevRenderUrl, currentFrame, prevFrame })`.

- [ ] **Step 1 : Ajouter `NodeDetail`**

Avant d'écrire, **lire `NodeDiffCard`** (`ui.tsx`) pour copier son rendu `readable` (les lignes qui mappent `nd.readable` en libellés) — le réutiliser tel quel dans `NodeDetail`.
```tsx
function NodeDetail({ node, renderUrl, prevRenderUrl, currentFrame, prevFrame }: {
  node: NodeDiffVisual | null;
  renderUrl: string | null; prevRenderUrl: string | null;
  currentFrame: { w: number; h: number } | null; prevFrame: { w: number; h: number } | null;
}) {
  if (!node) return (
    <div class="flex-1 flex items-center justify-center p-6 text-center">
      <p class="text-gray-600 text-xs">Clique un élément surligné pour voir son changement.</p>
    </div>
  );
  return (
    <div class="flex flex-col overflow-y-auto">
      <div class="px-4 py-3 border-b border-gray-800">
        <p class="text-xs font-medium text-gray-200 truncate" title={node.nodeName}>{node.nodeName}
          <span class="text-gray-600 font-mono ml-1 text-[10px]">{node.nodeType}</span></p>
      </div>
      <div class="flex border-b border-gray-800">
        <div class="flex-1 min-h-[96px] max-h-32 p-2 border-r border-gray-800 overflow-hidden flex flex-col items-center justify-center gap-1">
          {node.before_bbox && prevRenderUrl && prevFrame
            ? <NodeCrop url={prevRenderUrl} frameW={prevFrame.w} frameH={prevFrame.h} bbox={node.before_bbox} />
            : <span class="text-gray-700 text-xs">—</span>}
          <span class="text-[10px] text-gray-600">avant</span>
        </div>
        <div class="flex-1 min-h-[96px] max-h-32 p-2 overflow-hidden flex flex-col items-center justify-center gap-1">
          {node.after_bbox && renderUrl && currentFrame
            ? <NodeCrop url={renderUrl} frameW={currentFrame.w} frameH={currentFrame.h} bbox={node.after_bbox} />
            : <span class="text-gray-700 text-xs">—</span>}
          <span class="text-[10px] text-gray-600">après</span>
        </div>
      </div>
      {/* RÉUTILISER ICI le bloc de rendu `node.readable` copié de NodeDiffCard */}
    </div>
  );
}
```
> Le commentaire `RÉUTILISER ICI…` doit être remplacé par le JSX exact de rendu `readable` repris de `NodeDiffCard` (mêmes classes/format). Ne pas inventer un nouveau format.

- [ ] **Step 2 : Vérif + commit**
Run: `npm run typecheck && npm run build` → OK.
```bash
git add plugin/src/ui.tsx
git commit -m "feat(diff): NodeDetail — before/after crop + readable for the selected node"
```

---

## Task 5 : `DiffChips`

**Files:** Modify `plugin/src/ui.tsx`

**Produites :** `function DiffChips({ counts, beforeMode, showDerived, onToggleBefore, onToggleDerived })`.

- [ ] **Step 1 : Ajouter `DiffChips`**
```tsx
function DiffChips({ counts, beforeMode, showDerived, onToggleBefore, onToggleDerived }: {
  counts: { modified: number; added: number; removed: number; derived: number };
  beforeMode: boolean; showDerived: boolean;
  onToggleBefore: () => void; onToggleDerived: () => void;
}) {
  return (
    <div class="absolute top-2 left-2 right-2 flex flex-wrap items-center gap-1.5 text-[10px] z-10">
      <span class="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">{counts.modified} modifiés</span>
      {counts.added > 0   && <span class="px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">{counts.added} ajoutés</span>}
      {counts.removed > 0 && <span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">{counts.removed} supprimés</span>}
      {counts.derived > 0 && (
        <button onClick={onToggleDerived} aria-pressed={showDerived}
          class={`px-1.5 py-0.5 rounded ${showDerived ? 'bg-gray-600 text-gray-100' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>
          {showDerived ? '▾' : '▸'} {counts.derived} dérivés
        </button>
      )}
      <button onClick={onToggleBefore} aria-pressed={beforeMode}
        class="ml-auto px-2 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">
        {beforeMode ? 'Avant ▸' : 'Après ▸'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2 : Vérif + commit**
Run: `npm run typecheck && npm run build` → OK.
```bash
git add plugin/src/ui.tsx
git commit -m "feat(diff): DiffChips — counts + before/after + derived toggles"
```

---

## Task 6 : Refonte du corps de `DiffScreen` (assemblage)

**Files:** Modify `plugin/src/ui.tsx`

**But :** remplacer le corps `{data && (...)}` (les deux panneaux Nodes/Frame + Smart Data + block_moves + onglets) par : en-tête (inchangé) + **titre IA** + corps `HighlightCanvas` (gauche, avec `DiffChips` en overlay) + `NodeDetail` (droite). Conserver l'état `restoreMsg`, `loading`, `err`, l'écran « Checkpoint initial » si `!hasPrev`.

- [ ] **Step 1 : État + dérivations**

Dans `DiffScreen`, ajouter l'état et remplacer les calculs de listes :
```tsx
const [selectedId, setSelectedId] = useState<string | null>(null);
const [beforeMode, setBeforeMode] = useState(false);
// showMinor existe déjà → on le réutilise comme "showDerived"
```
Dérivations (après `const { data, ... } = state;`) :
```tsx
const nodeDiffs = data?.node_diffs ?? [];
const highlights = buildHighlights(nodeDiffs, beforeMode, showMinor);
const selected = nodeDiffs.find(n => n.nodeId === selectedId) ?? null;
const counts = {
  modified: nodeDiffs.filter(n => n.kind === 'modified' && n.significance !== 'minor').length,
  added:    nodeDiffs.filter(n => n.kind === 'added').length,
  removed:  nodeDiffs.filter(n => n.kind === 'removed').length,
  derived:  nodeDiffs.filter(n => n.significance === 'minor').length,
};
const canvasUrl  = beforeMode ? data?.prev_render_url  : data?.render_url;
const canvasKind = beforeMode ? data?.prev_render_kind : data?.render_kind;
const canvasFrame = beforeMode ? data?.prev_frame : data?.current_frame;
```

- [ ] **Step 2 : Titre IA sous l'en-tête**

Juste après le `</div>` de fermeture de l'en-tête (la barre nav), ajouter :
```tsx
{version.ai_summary && (
  <div class="px-4 py-2 border-b border-gray-800 flex-shrink-0">
    <p class="text-xs text-gray-300 leading-relaxed">{version.ai_summary}</p>
  </div>
)}
```

- [ ] **Step 3 : Remplacer le corps `{data && (...)}`**

Remplacer tout le bloc `{data && ( <div class="flex flex-1 ..."> ... </div> )}` (les deux panneaux actuels) par :
```tsx
{data && (
  hasPrev ? (
    <div class="flex flex-1 overflow-hidden">
      <div class="flex-1 flex flex-col border-r border-gray-800 overflow-hidden relative">
        <DiffChips counts={counts} beforeMode={beforeMode} showDerived={showMinor}
          onToggleBefore={() => setBeforeMode(v => !v)} onToggleDerived={() => setShowMinor(v => !v)} />
        {canvasUrl && canvasKind && canvasFrame
          ? <HighlightCanvas url={canvasUrl} kind={canvasKind} frame={canvasFrame}
              highlights={highlights} selectedId={selectedId} onSelect={setSelectedId} />
          : <div class="flex-1 flex items-center justify-center"><p class="text-gray-600 text-xs">Rendu indisponible.</p></div>}
      </div>
      <div class="w-72 flex flex-col overflow-hidden">
        <NodeDetail node={selected} renderUrl={data.render_url} prevRenderUrl={data.prev_render_url}
          currentFrame={data.current_frame} prevFrame={data.prev_frame} />
        {version.ai_summary && (
          <div class="px-4 py-3 mt-auto border-t border-gray-800">
            <p class="text-[10px] text-gray-500 uppercase tracking-wide mb-1">IA</p>
            <p class="text-xs text-gray-300 leading-relaxed">{version.ai_summary}</p>
          </div>
        )}
      </div>
    </div>
  ) : (
    /* CONSERVER l'écran « Checkpoint initial » existant (le bloc !hasPrev actuel) */
  )
)}
```
> Reprendre exactement le JSX « Checkpoint initial » actuel pour la branche `!hasPrev`.
> Retirer du header les boutons d'onglet **Nodes/Frame** et **Split/Overlay** (et le `opacity` slider) — ils n'ont plus de cible.

- [ ] **Step 4 : Vérif + commit**
Run: `npm run typecheck && npm test && npm run build` → vert.
```bash
git add plugin/src/ui.tsx
git commit -m "feat(diff): frame-hero body — HighlightCanvas + NodeDetail + chips, drop dual lists"
```

---

## Task 7 : Nettoyage du code mort

**Files:** Modify `plugin/src/ui.tsx`, `plugin/src/diffReducer.ts`

- [ ] **Step 1 : Retirer l'inutilisé**
- Supprimer `NodeDiffCard` et `SvgFrame` s'ils ne sont plus référencés (grep `NodeDiffCard`, `SvgFrame` dans `ui.tsx` → 0 usage hors définition). Garder `NodeCrop` (utilisé par `NodeDetail`).
- Dans `diffReducer.ts` : si `SET_MODE`/`SET_VIEW` et les champs `mode`/`view` ne sont plus référencés dans `ui.tsx`, les retirer du type `DiffState`/`DiffAction` et du reducer (sinon les laisser — vérifier d'abord par grep). Mettre à jour `initialDiffState`.
- Retirer les imports devenus inutiles (`NodeDiffVisual` reste utilisé).

- [ ] **Step 2 : Vérif + commit**
Run (depuis `plugin/`): `npm run typecheck && npm test && npm run build` → vert.
```bash
git add plugin/src/ui.tsx plugin/src/diffReducer.ts
git commit -m "refactor(diff): drop NodeDiffCard/SvgFrame and unused view/mode reducer state"
```

---

## Self-Review

**Spec coverage :** héros frame surlignée → T3 ✅ ; clic→détail → T4 + T6 ✅ ; chips + toggle avant/après + dérivés → T5 + T6 ✅ ; titre IA → T6 ✅ ; suppression listes/blocs/onglets → T6 + T7 ✅ ; helper pur testable → T1 ✅ ; zéro backend ✅ ; tones violet/vert/rouge/gris → T3 ✅ ; removed en mode avant → T1 (before_bbox) + T6 (counts/canvas) ✅.

**Placeholders :** deux renvois explicites au code existant (le rendu `readable` de `NodeDiffCard` en T4 ; l'écran « Checkpoint initial » en T6) — volontaires (réutilisation à l'identique, ne pas réinventer), pas des placeholders flous. Le reste = code complet.

**Type consistency :** `Highlight`/`Tone` (T1) ↔ `HighlightCanvas` (T3) ↔ `DiffScreen` (T6) ; `buildHighlights(nodeDiffs, beforeMode, showDerived)` même signature partout ; `NodeCrop`/`FrameImage` réutilisés avec leurs props existantes ; `counts` shape cohérente T5/T6 ; `showMinor` réutilisé comme `showDerived`.

**YAGNI / différé :** zoom/pan canvas, animations, raccourcis clavier (au-delà des ◀▶ existants).
