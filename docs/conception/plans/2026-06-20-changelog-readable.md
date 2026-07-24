# Changelog lisible designer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre chaque changement du changelog lisible pour un designer (couleur = pastille + hex, graisse nommée, rotation/déplacement/texte) par un **formateur déterministe**, et réduire l'IA à un **titre d'une ligne**.

**Architecture:** Backend pur `formatChange`/`formatNodeChanges` → `ReadableChange[]` exposé sur les `node_diffs` ; le plugin rend ces descripteurs (pastilles/icônes) au lieu du brut. Le diff est correct (vérifié) ; l'illisibilité venait de gpt-4o-mini qui massacrait la donnée.

**Tech Stack:** TypeScript strict, HonoJS, Preact, Vitest.

## Global Constraints

- **Couleurs : pastille + code HEX conservé** (jamais de nom approximatif — précision beta).
- Formateur **pur** (pas d'I/O), **testable** ; biais sûr : propriété inconnue → `generic` (jamais d'invention).
- Réutilise `scoreChange` (#41) pour **ignorer les changements mineurs** (cascade) dans la liste par nœud.
- Ne change PAS le moteur de diff (correct). Le titre IA reste (gpt-4o-mini), réduit à 1 ligne.

---

## File Structure

- **Create** `backend/src/services/change-format.service.ts` — `ReadableChange`, `weightName`, `formatChange`, `formatNodeChanges`.
- **Create** `backend/src/tests/change-format.service.test.ts`.
- **Modify** `backend/src/controllers/branches.controller.ts` — `readable` sur chaque `node_diff`.
- **Modify** `backend/src/services/openai.service.ts` — prompt = titre 1 ligne.
- **Modify** `backend/src/tests/openai.service.test.ts` — adapte l'assertion de prompt.
- **Modify** `plugin/src/diffReducer.ts` — type `ReadableChange` + `readable?` sur `NodeDiffVisual`.
- **Modify** `plugin/src/ui.tsx` — `NodeDiffCard` rend `readable`.

---

## Task 1 : `formatChange` + `weightName` (pur)

**Files:**
- Create: `backend/src/services/change-format.service.ts`
- Test: `backend/src/tests/change-format.service.test.ts`

**Interfaces:**
- Produces : le type `ReadableChange` (union ci-dessous) ; `weightName(v: unknown): string` ; `formatChange(c: PropertyChange): ReadableChange`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `backend/src/tests/change-format.service.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { formatChange, weightName } from '../services/change-format.service.js';
import type { PropertyChange } from '../types/figma.js';

const ch = (o: Partial<PropertyChange>): PropertyChange => ({ property: 'x', oldValue: 0, newValue: 0, ...o });

describe('weightName', () => {
  it('mappe les poids connus', () => {
    expect(weightName(400)).toBe('Regular');
    expect(weightName(600)).toBe('SemiBold');
    expect(weightName(800)).toBe('ExtraBold');
  });
  it('repli sur la valeur brute si inconnu', () => expect(weightName(450)).toBe('450'));
});

describe('formatChange', () => {
  it('fill → color, hex conservés', () => {
    expect(formatChange(ch({ property: 'fill', oldValue: '#00F0FF', newValue: '#4B898D' })))
      .toEqual({ kind: 'color', label: 'Couleur', from: '#00F0FF', to: '#4B898D' });
  });
  it('fontWeight → weight nommé', () => {
    expect(formatChange(ch({ property: 'fontWeight', oldValue: 600, newValue: 800 })))
      .toEqual({ kind: 'weight', label: 'Graisse', from: 'SemiBold', to: 'ExtraBold' });
  });
  it('rotation → degrés (new - old)', () => {
    expect(formatChange(ch({ property: 'rotation', oldValue: -180, newValue: 0 })))
      .toEqual({ kind: 'rotation', label: 'Rotation', degrees: 180 });
  });
  it('characters → text', () => {
    expect(formatChange(ch({ property: 'characters', oldValue: 'Hi', newValue: 'Hello' })))
      .toEqual({ kind: 'text', label: 'Texte', from: 'Hi', to: 'Hello' });
  });
  it('opacity → %', () => {
    expect(formatChange(ch({ property: 'opacity', oldValue: 1, newValue: 0.5 })))
      .toEqual({ kind: 'opacity', label: 'Opacité', from: 100, to: 50 });
  });
  it('propriété inconnue → generic (jamais d\'invention)', () => {
    expect(formatChange(ch({ property: 'mystery', oldValue: 1, newValue: 2, delta: '1 → 2' })))
      .toEqual({ kind: 'generic', label: 'mystery', detail: '1 → 2' });
  });
});
```

- [ ] **Step 2 : Lancer → échec**

Run: `cd backend && npx vitest run src/tests/change-format.service.test.ts`
Expected: FAIL — import non résolu.

- [ ] **Step 3 : Implémenter**

Create `backend/src/services/change-format.service.ts` :
```ts
import type { PropertyChange } from '../types/figma.js';

export type ReadableChange =
  | { kind: 'color';      label: string; from: string; to: string }
  | { kind: 'weight';     label: string; from: string; to: string }
  | { kind: 'text';       label: string; from: string; to: string }
  | { kind: 'rotation';   label: string; degrees: number }
  | { kind: 'move';       label: string; dx: number; dy: number }
  | { kind: 'resize';     label: string; dw: number; dh: number }
  | { kind: 'opacity';    label: string; from: number; to: number }
  | { kind: 'visibility'; label: string; visible: boolean }
  | { kind: 'generic';    label: string; detail: string };

const WEIGHTS: Record<number, string> = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
};
export function weightName(v: unknown): string {
  return typeof v === 'number' && WEIGHTS[v] ? WEIGHTS[v] : String(v ?? '');
}

const str = (v: unknown): string => String(v ?? '');
function numDelta(c: PropertyChange): number {
  return typeof c.newValue === 'number' && typeof c.oldValue === 'number' ? c.newValue - c.oldValue : 0;
}
const pct = (v: unknown): number => (typeof v === 'number' ? Math.round(v * 100) : 0);

// Traduit UN changement de propriété en descripteur designer. Biais sûr : inconnu → generic.
// (x/y/width/height sont fusionnés en amont par formatNodeChanges, pas ici.)
export function formatChange(c: PropertyChange): ReadableChange {
  switch (c.property) {
    case 'fill':       return { kind: 'color', label: 'Couleur', from: str(c.oldValue), to: str(c.newValue) };
    case 'stroke':     return { kind: 'color', label: 'Contour', from: str(c.oldValue), to: str(c.newValue) };
    case 'fontWeight': return { kind: 'weight', label: 'Graisse', from: weightName(c.oldValue), to: weightName(c.newValue) };
    case 'fontFamily': return { kind: 'text', label: 'Police', from: str(c.oldValue), to: str(c.newValue) };
    case 'characters': return { kind: 'text', label: 'Texte', from: str(c.oldValue), to: str(c.newValue) };
    case 'rotation':   return { kind: 'rotation', label: 'Rotation', degrees: numDelta(c) };
    case 'opacity':    return { kind: 'opacity', label: 'Opacité', from: pct(c.oldValue), to: pct(c.newValue) };
    case 'visible':    return { kind: 'visibility', label: 'Visibilité', visible: c.newValue === true };
    default:           return { kind: 'generic', label: c.property, detail: c.delta ?? `${str(c.oldValue)} → ${str(c.newValue)}` };
  }
}
```

- [ ] **Step 4 : Lancer → succès**

Run: `cd backend && npx vitest run src/tests/change-format.service.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/change-format.service.ts backend/src/tests/change-format.service.test.ts
git commit -m "feat(backend): formatChange — changement → langage designer (pur, hex conservés)"
```

---

## Task 2 : `formatNodeChanges` (pur — fusion x/y, filtre mineurs)

**Files:**
- Modify: `backend/src/services/change-format.service.ts`
- Test: `backend/src/tests/change-format.service.test.ts`

**Interfaces:**
- Consumes : `formatChange` (Task 1), `scoreChange`/`LayoutContext` (significance.service, #41), `NodeDelta` (figma.ts).
- Produces : `formatNodeChanges(nd: NodeDelta): ReadableChange[]`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Append to `backend/src/tests/change-format.service.test.ts` :
```ts
import { formatNodeChanges } from '../services/change-format.service.js';
import type { NodeDelta } from '../types/figma.js';

const nd = (over: Partial<NodeDelta>): NodeDelta =>
  ({ nodeId: 'n', nodeName: 'n', nodeType: 'FRAME', changes: [], ...over });

describe('formatNodeChanges', () => {
  it('fusionne x + y en un seul move', () => {
    const r = formatNodeChanges(nd({ changes: [
      { property: 'x', oldValue: 0, newValue: 4 },
      { property: 'y', oldValue: 0, newValue: -3 },
    ] }));
    expect(r).toEqual([{ kind: 'move', label: 'Position', dx: 4, dy: -3 }]);
  });

  it('fusionne width + height en un seul resize', () => {
    const r = formatNodeChanges(nd({ changes: [
      { property: 'width', oldValue: 100, newValue: 120 },
      { property: 'height', oldValue: 50, newValue: 50 },
    ] }));
    expect(r).toEqual([{ kind: 'resize', label: 'Taille', dw: 20, dh: 0 }]);
  });

  it('ignore les changements mineurs (cascade : x/y d\'un enfant de flux)', () => {
    const r = formatNodeChanges(nd({
      changes: [{ property: 'y', oldValue: 0, newValue: -51 }],
      layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO',
    }));
    expect(r).toEqual([]); // dérivé → mineur → pas listé
  });

  it('garde une couleur (notable) + fusionne le reste', () => {
    const r = formatNodeChanges(nd({ changes: [
      { property: 'fill', oldValue: '#FFFFFF', newValue: '#FF0101' },
    ] }));
    expect(r).toEqual([{ kind: 'color', label: 'Couleur', from: '#FFFFFF', to: '#FF0101' }]);
  });
});
```

- [ ] **Step 2 : Lancer → échec**

Run: `cd backend && npx vitest run src/tests/change-format.service.test.ts`
Expected: FAIL — `formatNodeChanges` n'existe pas.

- [ ] **Step 3 : Implémenter**

In `backend/src/services/change-format.service.ts`, ajouter en tête l'import :
```ts
import { scoreChange, type LayoutContext } from './significance.service.js';
import type { NodeDelta } from '../types/figma.js';
```
Et la fonction (en bas du fichier) :
```ts
// Liste lisible des changements NOTABLES d'un nœud : fusionne x/y → move, width/height
// → resize, ignore les mineurs (cascade auto-layout, via scoreChange #41).
export function formatNodeChanges(nd: NodeDelta): ReadableChange[] {
  const ctx: LayoutContext = {
    layoutSizingHorizontal: nd.layoutSizingHorizontal,
    layoutSizingVertical: nd.layoutSizingVertical,
    layoutPositioning: nd.layoutPositioning,
  };
  const out: ReadableChange[] = [];
  let dx = 0, dy = 0, hasMove = false;
  let dw = 0, dh = 0, hasResize = false;
  for (const c of nd.changes) {
    if (scoreChange(c, ctx) === 'minor') continue;
    if (c.property === 'x')      { dx = numDelta(c); hasMove = true; continue; }
    if (c.property === 'y')      { dy = numDelta(c); hasMove = true; continue; }
    if (c.property === 'width')  { dw = numDelta(c); hasResize = true; continue; }
    if (c.property === 'height') { dh = numDelta(c); hasResize = true; continue; }
    out.push(formatChange(c));
  }
  if (hasMove)   out.push({ kind: 'move', label: 'Position', dx, dy });
  if (hasResize) out.push({ kind: 'resize', label: 'Taille', dw, dh });
  return out;
}
```

- [ ] **Step 4 : Lancer → succès**

Run: `cd backend && npx vitest run src/tests/change-format.service.test.ts`
Expected: PASS (tous).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/change-format.service.ts backend/src/tests/change-format.service.test.ts
git commit -m "feat(backend): formatNodeChanges — fusion move/resize + filtre mineurs (pur)"
```

---

## Task 3 : Exposer `readable` sur les `node_diffs`

**Files:**
- Modify: `backend/src/controllers/branches.controller.ts`

**Interfaces:**
- Consumes : `formatNodeChanges` (Task 2), `ReadableChange` (Task 1).

- [ ] **Step 1 : Importer + ajouter `readable` au type local + au remplissage**

Dans `backend/src/controllers/branches.controller.ts`, ajouter l'import :
```ts
import { formatNodeChanges, type ReadableChange } from '../services/change-format.service.js';
```
Dans le type du tableau `nodeDiffs` (la déclaration `const nodeDiffs: Array<{...}> = []`), ajouter le champ :
```ts
    readable: ReadableChange[];
```
Dans le `push` des **modified**, ajouter (le `nd` y est un `NodeDelta` complet) :
```ts
        readable: formatNodeChanges(nd as unknown as import('../types/figma.js').NodeDelta),
```
Dans les `push` **added** et **removed**, ajouter :
```ts
        readable: [],
```

- [ ] **Step 2 : Typecheck + suite backend**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.
Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 3 : Commit**

```bash
git add backend/src/controllers/branches.controller.ts
git commit -m "feat(backend): expose readable[] (langage designer) sur les node_diffs"
```

---

## Task 4 : Titre IA réduit à une ligne

**Files:**
- Modify: `backend/src/services/openai.service.ts`
- Modify: `backend/src/tests/openai.service.test.ts`

- [ ] **Step 1 : Adapter l'assertion de prompt (test d'abord)**

Dans `backend/src/tests/openai.service.test.ts`, le test « le prompt met les notables avant le regroupement des mineurs » vérifie `'Changements notables'`. Remplacer ses assertions de contenu par le nouveau contrat (titre 1 ligne) :
```ts
    expect(prompt).toContain('Header');                 // le nom du nœud notable reste fourni
    expect(prompt.toLowerCase()).toContain('une ligne'); // on demande un titre d'UNE ligne
```

- [ ] **Step 2 : Lancer → échec**

Run: `cd backend && npx vitest run src/tests/openai.service.test.ts`
Expected: FAIL (le prompt ne contient pas encore « une ligne »).

- [ ] **Step 3 : Réduire le prompt à un titre**

Dans `backend/src/services/openai.service.ts`, remplacer le bloc final de `buildPrompt` (les `lines.push('\nGénère un patch note…')`) par :
```ts
    lines.push(
      '\nRésume ces changements en UNE seule ligne (un titre court, style « Refonte des couleurs du header »).',
      'En français, factuel, ne jamais inventer de valeur. Pas de liste, pas de détails techniques — juste le titre.',
    );
```

- [ ] **Step 4 : Lancer → succès + suite**

Run: `cd backend && npx vitest run src/tests/openai.service.test.ts`
Expected: PASS.
Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/openai.service.ts backend/src/tests/openai.service.test.ts
git commit -m "feat(backend): titre IA réduit à une ligne (le détail lisible vient du formateur)"
```

---

## Task 5 : Rendu plugin des `readable`

**Files:**
- Modify: `plugin/src/diffReducer.ts`
- Modify: `plugin/src/ui.tsx` (NodeDiffCard, ~l.897-906)

**Interfaces:**
- Consumes : le JSON `readable` produit par le backend (Task 3).

- [ ] **Step 1 : Type `ReadableChange` (miroir) + champ sur `NodeDiffVisual`**

Dans `plugin/src/diffReducer.ts`, après `PropertyChange` :
```ts
export type ReadableChange =
  | { kind: 'color';      label: string; from: string; to: string }
  | { kind: 'weight';     label: string; from: string; to: string }
  | { kind: 'text';       label: string; from: string; to: string }
  | { kind: 'rotation';   label: string; degrees: number }
  | { kind: 'move';       label: string; dx: number; dy: number }
  | { kind: 'resize';     label: string; dw: number; dh: number }
  | { kind: 'opacity';    label: string; from: number; to: number }
  | { kind: 'visibility'; label: string; visible: boolean }
  | { kind: 'generic';    label: string; detail: string };
```
Et dans `NodeDiffVisual`, ajouter :
```ts
  readable?: ReadableChange[];
```

- [ ] **Step 2 : Rendre `readable` dans `NodeDiffCard`**

Dans `plugin/src/ui.tsx`, remplacer le bloc `{nd.changes.length > 0 && (...)}` (l.897-906) par un rendu des `readable` (repli sur le brut si absent) :
```tsx
      {(nd.readable && nd.readable.length > 0) ? (
        <div class="px-3 py-2 border-t border-gray-800 flex flex-col gap-1">
          {nd.readable.map((r, i) => (
            <div key={i} class="flex items-center gap-2 text-[11px]">
              <span class="text-gray-400 w-16 flex-shrink-0">{r.label}</span>
              <span class="text-gray-200 flex items-center gap-1.5 leading-tight">
                {r.kind === 'color' ? (
                  <>
                    <span class="inline-block w-3 h-3 rounded-sm border border-gray-600" style={{ background: r.from }} />
                    <span class="font-mono text-gray-500">{r.from}</span>
                    <span class="text-gray-600">→</span>
                    <span class="inline-block w-3 h-3 rounded-sm border border-gray-600" style={{ background: r.to }} />
                    <span class="font-mono">{r.to}</span>
                  </>
                ) : r.kind === 'weight' || r.kind === 'text' ? (
                  <span><span class="text-gray-500">{r.from}</span> → {r.to}</span>
                ) : r.kind === 'rotation' ? (
                  <span>↻ {r.degrees > 0 ? '+' : ''}{r.degrees}°</span>
                ) : r.kind === 'move' ? (
                  <span>↔ {r.dx}px, {r.dy}px</span>
                ) : r.kind === 'resize' ? (
                  <span>⤢ {r.dw > 0 ? '+' : ''}{r.dw}px, {r.dh > 0 ? '+' : ''}{r.dh}px</span>
                ) : r.kind === 'opacity' ? (
                  <span>{r.from}% → {r.to}%</span>
                ) : r.kind === 'visibility' ? (
                  <span>{r.visible ? 'Affiché' : 'Masqué'}</span>
                ) : (
                  <span class="font-mono text-gray-500">{r.detail}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : nd.changes.length > 0 && (
        <div class="px-3 py-2 border-t border-gray-800 flex flex-col gap-0.5">
          {nd.changes.map((ch, i) => (
            <div key={i} class="flex items-start gap-2">
              <span class="text-[10px] font-mono text-gray-500 w-20 flex-shrink-0 truncate">{ch.property}</span>
              <span class="text-[10px] text-purple-400 font-mono leading-tight">{ch.delta ?? `${String(ch.oldValue)} → ${String(ch.newValue)}`}</span>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 3 : Typecheck + suite plugin**

Run: `cd plugin && npx tsc --noEmit`
Expected: exit 0.
Run: `cd plugin && npx vitest run`
Expected: PASS (rendu = glue, pas de test unitaire ; non-régression).

- [ ] **Step 4 : Commit**

```bash
git add plugin/src/diffReducer.ts plugin/src/ui.tsx
git commit -m "feat(plugin): rendu lisible des changements (pastilles couleur, icônes) — repli sur le brut"
```

---

## Vérification manuelle (post-plan)
Build + reload → ouvrir le diff d'un checkpoint avec couleurs/rotation/texte : la liste affiche **pastille + hex**, **graisse nommée**, `↻ Pivoté X°`, sans noms de propriétés ni hex hallucinés ; le titre IA = **une ligne**.

## Self-Review (auteur du plan)
- **Couverture spec** : §3.1 formatChange → Task 1 ✅ · §3.2 formatNodeChanges (fusion + filtre mineurs) → Task 2 ✅ · §3.3 expose readable → Task 3 ✅ · §3.4 titre IA 1 ligne → Task 4 ✅ · §3.5 rendu plugin (pastilles/icônes, repli) → Task 5 ✅ · couleurs hex conservés (Global) → formatChange (`from/to` = hex) ✅.
- **Placeholders** : aucun — code complet.
- **Cohérence types** : `ReadableChange` (mêmes variantes backend Task 1 / plugin Task 5), `formatChange`/`formatNodeChanges`/`weightName`, `readable` sur node_diff (Task 3) consommé Task 5. ✅
- **Ordre** : Task 1 → 2 (formatNodeChanges consomme formatChange) → 3 (endpoint) ; 4 indépendant ; 5 (plugin) consomme le JSON de 3. ✅
