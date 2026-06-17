# Changelog intelligent (significativité) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiérarchiser le changelog — faire ressortir les changements *notables* et regrouper les *mineurs* (sous-perceptuels) — sans toucher au diff 0.01px ni ajouter de friction.

**Architecture:** Couche **purе** côté backend (`significance.service.ts`) qui classe chaque `PropertyChange` (`scoreChange`) et partitionne le `DeltaJSON` (`rankDelta`). Le prompt de l'AI Patch Note (`openai.service.ts`) consomme le delta **rangé** → résumé qui mène avec le notable et groupe le mineur. Plugin inchangé.

**Tech Stack:** TypeScript strict (zéro `any`), HonoJS, Vitest. Tests dans `backend/src/tests/`, imports ESM `.js`.

## Global Constraints

- **NON-DESTRUCTIF** : ne PAS modifier `diff.service.ts`, le `DeltaJSON`, ni `analysis_json`. La significativité est une couche de **présentation** ajoutée à côté.
- Aucune alerte / étape / configuration utilisateur (anti-friction).
- Fonctions de scoring/ranking **pures** (pas d'I/O, pas de mutation de l'entrée).
- Seuils centralisés dans **un seul objet** exporté (calibrables).

---

## File Structure

- **Create** `backend/src/services/significance.service.ts` — `scoreChange`, `rankDelta`, seuils. Pur, aucune dépendance hors types.
- **Create** `backend/src/tests/significance.service.test.ts` — tests purs.
- **Modify** `backend/src/services/openai.service.ts` — `buildPrompt` consomme `rankDelta`.
- **Modify** `backend/src/tests/openai.service.test.ts` — test d'intégration prompt.

Types réutilisés (déjà existants, `backend/src/types/figma.ts`) :
```ts
interface PropertyChange { property: string; oldValue: unknown; newValue: unknown; delta?: string }
interface NodeDelta { nodeId: string; nodeName: string; nodeType: string; changes: PropertyChange[] }
interface DeltaJSON { modified: NodeDelta[]; added: NodeDelta[]; removed: NodeDelta[]; totalChanges: number; metadata: {...} }
```

---

## Task 1 : `scoreChange` (classification pure d'un changement)

**Files:**
- Create: `backend/src/services/significance.service.ts`
- Test: `backend/src/tests/significance.service.test.ts`

**Interfaces:**
- Produces: `type Significance = 'notable' | 'minor'` ; `function scoreChange(change: PropertyChange): Significance` ; `const SIGNIFICANCE_THRESHOLDS: Record<string, number>`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `backend/src/tests/significance.service.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { scoreChange } from '../services/significance.service.js';
import type { PropertyChange } from '../types/figma.js';

const ch = (over: Partial<PropertyChange>): PropertyChange =>
  ({ property: 'x', oldValue: 0, newValue: 0, ...over });

describe('scoreChange', () => {
  it('propriété qualitative (fills) → toujours notable', () => {
    expect(scoreChange(ch({ property: 'fills', oldValue: 'a', newValue: 'b' }))).toBe('notable');
  });

  it('texte (characters) → notable', () => {
    expect(scoreChange(ch({ property: 'characters', oldValue: 'Hi', newValue: 'Hello' }))).toBe('notable');
  });

  it('déplacement ≥ 1px → notable', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: 10, newValue: 12 }))).toBe('notable');
  });

  it('déplacement < 1px → minor', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: 10, newValue: 10.3 }))).toBe('minor');
  });

  it('opacité : Δ ≥ 0.05 → notable, sinon minor', () => {
    expect(scoreChange(ch({ property: 'opacity', oldValue: 1, newValue: 0.9 }))).toBe('notable');
    expect(scoreChange(ch({ property: 'opacity', oldValue: 1, newValue: 0.99 }))).toBe('minor');
  });

  it('rotation : Δ ≥ 1° → notable, sinon minor', () => {
    expect(scoreChange(ch({ property: 'rotation', oldValue: 0, newValue: 2 }))).toBe('notable');
    expect(scoreChange(ch({ property: 'rotation', oldValue: 0, newValue: 0.2 }))).toBe('minor');
  });

  it('propriété inconnue → conservateur (notable)', () => {
    expect(scoreChange(ch({ property: 'mysteryProp', oldValue: 1, newValue: 1 }))).toBe('notable');
  });

  it('valeurs non numériques sur prop numérique → conservateur (notable)', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: undefined, newValue: 5 }))).toBe('notable');
  });
});
```

- [ ] **Step 2 : Lancer les tests → échec**

Run: `cd backend && npx vitest run src/tests/significance.service.test.ts`
Expected: FAIL — `Failed to resolve import "../services/significance.service.js"`.

- [ ] **Step 3 : Implémenter `scoreChange`**

Create `backend/src/services/significance.service.ts` :

```ts
import type { PropertyChange } from '../types/figma.js';

export type Significance = 'notable' | 'minor';

// Propriétés qualitatives : tout changement est notable (couleur, texte, structure…).
const QUALITATIVE = new Set<string>([
  'fills', 'strokes', 'characters', 'visible', 'vectorPaths', 'effects',
  'imageHash', 'scaleMode', 'fontFamily', 'fontStyle', 'fontStyleName', 'fontWeight',
]);

// Propriétés numériques : notable seulement au-delà du seuil (sinon = bruit sous-perceptuel).
// Seuils calibrables — point d'ajustement unique (les beta affineront).
export const SIGNIFICANCE_THRESHOLDS: Record<string, number> = {
  x: 1, y: 1, width: 1, height: 1,   // px
  fontSize: 1,                       // px
  cornerRadius: 1, strokeWeight: 1,  // px
  opacity: 0.05,                     // 0..1
  rotation: 1,                       // degrés
};

function magnitude(c: PropertyChange): number | null {
  if (typeof c.oldValue === 'number' && typeof c.newValue === 'number') {
    return Math.abs(c.newValue - c.oldValue);
  }
  return null;
}

/**
 * Classe un changement de propriété en 'notable' ou 'minor'.
 * Biais CONSERVATEUR : propriété inconnue ou valeurs illisibles → 'notable'
 * (dans le doute, on montre — on ne masque jamais un vrai changement).
 */
export function scoreChange(change: PropertyChange): Significance {
  if (QUALITATIVE.has(change.property)) return 'notable';
  const threshold = SIGNIFICANCE_THRESHOLDS[change.property];
  if (threshold === undefined) return 'notable';
  const mag = magnitude(change);
  if (mag === null) return 'notable';
  return mag >= threshold ? 'notable' : 'minor';
}
```

- [ ] **Step 4 : Lancer les tests → succès**

Run: `cd backend && npx vitest run src/tests/significance.service.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/significance.service.ts backend/src/tests/significance.service.test.ts
git commit -m "feat(backend): scoreChange — significativité d'un changement (pur)"
```

---

## Task 2 : `rankDelta` (partition du DeltaJSON)

**Files:**
- Modify: `backend/src/services/significance.service.ts`
- Test: `backend/src/tests/significance.service.test.ts`

**Interfaces:**
- Consumes: `scoreChange` (Task 1).
- Produces: `interface RankedDelta { notableModified: NodeDelta[]; minorModified: NodeDelta[]; added: NodeDelta[]; removed: NodeDelta[]; minorCount: number }` ; `function rankDelta(delta: DeltaJSON): RankedDelta`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Append to `backend/src/tests/significance.service.test.ts` :

```ts
import { rankDelta } from '../services/significance.service.js';
import type { DeltaJSON, NodeDelta } from '../types/figma.js';

const node = (name: string, changes: PropertyChange[]): NodeDelta =>
  ({ nodeId: name, nodeName: name, nodeType: 'RECTANGLE', changes });

const delta = (over: Partial<DeltaJSON>): DeltaJSON => ({
  modified: [], added: [], removed: [], totalChanges: 0,
  metadata: { v1CapturedAt: '', v2CapturedAt: '', epsilon: 0.01, processingTimeMs: 0 },
  ...over,
});

describe('rankDelta', () => {
  it('nœud modifié avec ≥1 changement notable → notableModified', () => {
    const d = delta({ modified: [node('Header', [{ property: 'fills', oldValue: 'a', newValue: 'b' }])] });
    const r = rankDelta(d);
    expect(r.notableModified.map(n => n.nodeName)).toEqual(['Header']);
    expect(r.minorModified).toHaveLength(0);
  });

  it('nœud modifié uniquement mineur → minorModified + minorCount', () => {
    const d = delta({ modified: [node('Box', [{ property: 'x', oldValue: 0, newValue: 0.2 }])] });
    const r = rankDelta(d);
    expect(r.minorModified.map(n => n.nodeName)).toEqual(['Box']);
    expect(r.notableModified).toHaveLength(0);
    expect(r.minorCount).toBe(1);
  });

  it('added / removed passent toujours (notables par nature)', () => {
    const d = delta({ added: [node('New', [])], removed: [node('Gone', [])] });
    const r = rankDelta(d);
    expect(r.added.map(n => n.nodeName)).toEqual(['New']);
    expect(r.removed.map(n => n.nodeName)).toEqual(['Gone']);
  });

  it('ne mute pas le delta d\'entrée', () => {
    const d = delta({ modified: [node('Box', [{ property: 'x', oldValue: 0, newValue: 0.2 }])] });
    const before = JSON.stringify(d);
    rankDelta(d);
    expect(JSON.stringify(d)).toBe(before);
  });
});
```

- [ ] **Step 2 : Lancer → échec**

Run: `cd backend && npx vitest run src/tests/significance.service.test.ts`
Expected: FAIL — `rankDelta is not a function` / import non résolu.

- [ ] **Step 3 : Implémenter `rankDelta`**

Append to `backend/src/services/significance.service.ts` :

```ts
import type { DeltaJSON, NodeDelta } from '../types/figma.js';

export interface RankedDelta {
  notableModified: NodeDelta[]; // nœuds modifiés avec ≥1 changement notable
  minorModified: NodeDelta[];   // nœuds modifiés uniquement mineurs
  added: NodeDelta[];           // toujours notables (pass-through)
  removed: NodeDelta[];         // toujours notables (pass-through)
  minorCount: number;           // = minorModified.length
}

/**
 * Partitionne un DeltaJSON pour l'affichage hiérarchisé. NON-DESTRUCTIF :
 * lit le delta sans le muter (le diff 0.01px reste intact ailleurs).
 */
export function rankDelta(delta: DeltaJSON): RankedDelta {
  const notableModified: NodeDelta[] = [];
  const minorModified: NodeDelta[] = [];
  for (const n of delta.modified) {
    const hasNotable = n.changes.some(c => scoreChange(c) === 'notable');
    (hasNotable ? notableModified : minorModified).push(n);
  }
  return {
    notableModified,
    minorModified,
    added: delta.added,
    removed: delta.removed,
    minorCount: minorModified.length,
  };
}
```

- [ ] **Step 4 : Lancer → succès**

Run: `cd backend && npx vitest run src/tests/significance.service.test.ts`
Expected: PASS (12 tests : 8 + 4).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/significance.service.ts backend/src/tests/significance.service.test.ts
git commit -m "feat(backend): rankDelta — partition notable/mineur du DeltaJSON (pur)"
```

---

## Task 3 : Intégrer le delta rangé dans le prompt IA

**Files:**
- Modify: `backend/src/services/openai.service.ts` (méthode `buildPrompt`, ~l.43-74)
- Test: `backend/src/tests/openai.service.test.ts`

**Interfaces:**
- Consumes: `rankDelta`, `RankedDelta` (Task 2).

- [ ] **Step 1 : Écrire le test d'intégration (échoue)**

Append to `backend/src/tests/openai.service.test.ts` :

```ts
describe('OpenAIService – changelog hiérarchisé', () => {
  it('le prompt met les notables avant le regroupement des mineurs', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
    const svc = new OpenAIService('test-key');
    const delta = makeDelta({
      totalChanges: 2,
      modified: [
        makeModifiedNode('Header', [{ property: 'fills', oldValue: 'a', newValue: 'b' }]),       // notable
        makeModifiedNode('Box',    [{ property: 'x', oldValue: 0, newValue: 0.3, delta: '+0.30px' }]), // minor
      ],
    });
    await svc.generatePatchNote(delta, 'Alice');
    const prompt = mockCreate.mock.calls[0][0].messages[1].content as string;

    expect(prompt).toContain('Changements notables');
    expect(prompt).toContain('Header');
    expect(prompt).toMatch(/mineur/i);
    // le notable apparaît avant le bloc mineur
    expect(prompt.indexOf('Header')).toBeLessThan(prompt.search(/mineur/i));
  });
});
```

- [ ] **Step 2 : Lancer → échec**

Run: `cd backend && npx vitest run src/tests/openai.service.test.ts`
Expected: FAIL (le prompt actuel ne contient ni « Changements notables » ni « mineur »).

- [ ] **Step 3 : Modifier `buildPrompt`**

In `backend/src/services/openai.service.ts` :

1. Ajouter l'import en tête (après l'import de `DeltaJSON`) :
```ts
import { rankDelta } from './significance.service.js';
```

2. Remplacer **entièrement** la méthode `buildPrompt` (l.43-74) par :
```ts
  private buildPrompt(delta: DeltaJSON, authorName: string): string {
    const ranked = rankDelta(delta);
    const lines: string[] = [
      `Auteur du checkpoint : ${authorName}`,
      `Total changements : ${delta.totalChanges}`,
      '',
    ];

    if (ranked.notableModified.length > 0) {
      lines.push('Changements notables :');
      for (const node of ranked.notableModified.slice(0, 8)) {
        const changeList = node.changes
          .map(c => `  - ${c.property} : ${c.delta ?? `${String(c.oldValue)} -> ${String(c.newValue)}`}`)
          .join('\n');
        lines.push(`• "${node.nodeName}" (${node.nodeType}) :\n${changeList}`);
      }
    }

    if (ranked.added.length > 0) {
      lines.push(`\nÉléments ajoutés : ${ranked.added.map(n => `"${n.nodeName}"`).join(', ')}`);
    }
    if (ranked.removed.length > 0) {
      lines.push(`\nÉléments supprimés : ${ranked.removed.map(n => `"${n.nodeName}"`).join(', ')}`);
    }
    if (ranked.minorCount > 0) {
      lines.push(`\nAjustements mineurs (sous-perceptuels) : ${ranked.minorCount} élément(s) — à mentionner groupés.`);
    }

    lines.push(
      '\nGénère un patch note en français, style changelog.',
      'Mets en AVANT les changements notables ; regroupe les ajustements mineurs en UNE ligne du type "(+ N ajustements mineurs)".',
      'Maximum 5 lignes. Factuel, ne jamais inventer.',
    );

    return lines.join('\n');
  }
```

- [ ] **Step 4 : Lancer les tests openai (+ non-régression)**

Run: `cd backend && npx vitest run src/tests/openai.service.test.ts`
Expected: PASS (les 10 existants + le nouveau).

- [ ] **Step 5 : Typecheck + suite backend complète**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.
Run: `cd backend && npx vitest run`
Expected: PASS (tous).

- [ ] **Step 6 : Commit**

```bash
git add backend/src/services/openai.service.ts backend/src/tests/openai.service.test.ts
git commit -m "feat(backend): AI Patch Note hiérarchisé (notable d'abord, mineurs groupés)"
```

---

## Vérification manuelle (post-plan)
Le rendu final du LLM n'est pas testé unitairement. Après implémentation, lancer une vraie capture avec un mix de changements (une couleur + plusieurs micro-déplacements) et vérifier que le résumé **mène avec la couleur** et **groupe les micro-déplacements** en « (+ N ajustements mineurs) ».

## Self-Review (auteur du plan)
- **Couverture spec** : §4.1 `scoreChange` → Task 1 ✅ · §4.2 `rankDelta` → Task 2 ✅ · §4.3 prompt → Task 3 ✅ · §2 non-destructif → Global Constraints + rankDelta ne mute pas (test) ✅ · §6 tests purs TDD ✅. Hors périmètre (Claude, Nodes-view, mode actif) : non inclus, conforme.
- **Placeholders** : aucun — code complet à chaque étape.
- **Cohérence types** : `Significance`, `scoreChange`, `SIGNIFICANCE_THRESHOLDS`, `RankedDelta` (notableModified/minorModified/added/removed/minorCount), `rankDelta` — noms identiques entre Tasks 1→3.
