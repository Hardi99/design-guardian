# Page-centric — Plan d'implémentation (Phase 2 : découverte, suivi, capture)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'utilisateur de voir toutes les frames de sa page, de désigner celles qu'il suit, et de les capturer toutes en un seul checkpoint.

**Architecture :** Le suivi d'une frame est marqué dans le fichier Figma lui-même (`pluginData`), comme l'est déjà `dg_id` — il voyage donc avec le fichier et vaut pour tous les éditeurs. La capture construit une racine synthétique dont les enfants sont **les frames suivies uniquement**, ce que le modèle « viewport » de la Phase 1 sait déjà traiter sans modification.

**Tech Stack :** TypeScript strict, Vitest, Preact (plugin Figma), HonoJS, Supabase PostgreSQL.

**Spec :** `docs/conception/specs/2026-09-20-page-centric-design.md` (révisé après trois spikes de mesure)

**Prérequis :** Phase 1 mergée (PR #72) — `viewportRootMap`, `nodeBboxIn`, `viewport`/`viewports[]`, migration 018.

## Portée de CE plan

**Inclus** : découverte des frames (§4.1), suivi par `pluginData` (§4.2), estimation du coût (§4.3), capture des frames suivies (§4.4), classification `scope_in`/`scope_out` (§4.5), asset `scope='page'` (§6.3).

**Exclus, et pourquoi** : les **rendus par viewport** (§5), que le spec plaçait en Phase 2, sont déplacés en **Phase 3**. Ils n'ont d'intérêt qu'une fois la liste des frames affichée dans le viewer, et les regrouper avec elle donne deux plans cohérents plutôt qu'un plan qui livre des images que personne n'affiche.

## Global Constraints

- **D7** — Le suivi est marqué dans le `pluginData` de la frame (clé `dg_tracked`), jamais en base.
- **D8** — **Rien n'est suivi par défaut.** Suivre d'office les frames d'une page recréerait le mur mesuré au spike (93,8 s sur 331 frames).
- **La racine synthétique DOIT porter un `dg_id`** : `compareSnapshots` calcule `useDgId = !!v1.root.dg_id && !!v2.root.dg_id`. Sans lui, le matching par `dg_id` se désactive **pour toute la page** et retombe silencieusement sur `id:`/`path:`.
- La racine synthétique garde une géométrie **constante** (`x:0, y:0, width:0, height:0`, `opacity:1`, `fills:[]`, `strokes:[]`) — c'est ce qui garantit qu'elle ne produit aucun diff (verrouillé par un test en Phase 1).
- Le préfixe de page `dg/` est **réservé** (branches + `_history`) : ces pages ne sont jamais capturables.
- **Taux d'estimation : 3 ms par nœud**, borne haute de la fourchette mesurée (2 à 3 ms/nœud). On sur-estime plutôt que de sur-promettre.
- TypeScript strict, **zéro `any`**. Séparation Service / Controller.
- **Baseline : 344 tests (214 backend + 130 plugin)** — aucune régression tolérée.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `plugin/src/trackedFrames.ts` | Découverte, suivi, comptage, estimation — **logique pure, testable sans Figma** | Créer |
| `plugin/src/trackedFrames.test.ts` | Tests du module ci-dessus | Créer |
| `plugin/src/ui.tsx` | Écran de liste des frames (recherche, cases, estimation) | Modifier |
| `plugin/src/main.ts` | Capture des frames suivies + gardes | Modifier |
| `plugin/src/types.ts` | Messages `REQUEST_FRAMES` / `FRAMES_LIST` / `SET_TRACKED` | Modifier |
| `backend/src/services/scope.service.ts` | `classifyScopeChanges` — entrée/sortie de périmètre | Créer |
| `backend/src/tests/scope.service.test.ts` | Tests du service ci-dessus | Créer |
| `backend/src/types/figma.ts` | `DeltaJSON.scopeIn` / `scopeOut` | Modifier |
| `backend/src/controllers/checkpoints.controller.ts` | Branchement dans le pipeline de capture | Modifier |
| `backend/src/controllers/versions.controller.ts` | Branchement restore + exposition | Modifier |
| `backend/src/types/api.ts` | `createAssetSchema` accepte `scope` | Modifier |

---

## Task 1 : Module `trackedFrames` — découverte, suivi, estimation

**Files:**
- Create : `plugin/src/trackedFrames.ts`
- Test : `plugin/src/trackedFrames.test.ts`

**Interfaces:**
- Produces :
  - `TrackableNode` — sous-ensemble structurel de `SceneNode` (`id`, `name`, `type`, `width?`, `height?`, `getPluginData`, `setPluginData`, `children?`), sur le modèle de `IdentifiableNode` dans `figmaIdentity.ts`.
  - `TRACKED_KEY = 'dg_tracked'`, `MS_PER_NODE = 3`, `WARN_MS = 10000`
  - `isTracked(n): boolean` · `setTracked(n, on): void` · `countNodes(n): number`
  - `listFrames(children): FrameEntry[]` où `FrameEntry = { id, name, type, tracked, nodes }`
  - `estimateMs(frames): number`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `plugin/src/trackedFrames.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  isTracked, setTracked, countNodes, listFrames, estimateMs,
  TRACKED_KEY, MS_PER_NODE, type TrackableNode,
} from './trackedFrames.js';

function fake(id: string, name: string, children: TrackableNode[] = [], data: Record<string, string> = {}): TrackableNode {
  return {
    id, name, type: 'FRAME', width: 100, height: 100, children,
    getPluginData: (k) => data[k] ?? '',
    setPluginData: (k, v) => { data[k] = v; },
  };
}

describe('isTracked / setTracked', () => {
  it('un nœud vierge n\'est pas suivi (rien par défaut)', () => {
    expect(isTracked(fake('a', 'A'))).toBe(false);
  });

  it('setTracked(true) puis isTracked → true', () => {
    const n = fake('a', 'A');
    setTracked(n, true);
    expect(n.getPluginData(TRACKED_KEY)).toBe('1');
    expect(isTracked(n)).toBe(true);
  });

  it('setTracked(false) efface la marque', () => {
    const n = fake('a', 'A');
    setTracked(n, true);
    setTracked(n, false);
    expect(isTracked(n)).toBe(false);
  });
});

describe('countNodes', () => {
  it('compte le nœud et tous ses descendants', () => {
    const tree = fake('f', 'F', [fake('a', 'A', [fake('a1', 'A1')]), fake('b', 'B')]);
    expect(countNodes(tree)).toBe(4);
  });

  it('un nœud sans enfant compte pour 1', () => {
    expect(countNodes(fake('solo', 'Solo'))).toBe(1);
  });
});

describe('listFrames', () => {
  it('liste toutes les frames, suivies ou non', () => {
    const a = fake('a', 'Accueil');
    const b = fake('b', 'Panier');
    setTracked(a, true);
    const out = listFrames([a, b]);
    expect(out.map(f => [f.id, f.tracked])).toEqual([['a', true], ['b', false]]);
  });

  it('ne compte les nœuds QUE pour les frames suivies (la liste doit rester instantanée)', () => {
    const a = fake('a', 'Accueil', [fake('x', 'X'), fake('y', 'Y')]);
    const b = fake('b', 'Panier', [fake('z', 'Z')]);
    setTracked(a, true);
    const out = listFrames([a, b]);
    expect(out.find(f => f.id === 'a')?.nodes).toBe(3); // a + x + y
    expect(out.find(f => f.id === 'b')?.nodes).toBe(0); // non suivie → pas traversée
  });
});

describe('estimateMs', () => {
  it('somme les nœuds des frames suivies × le taux mesuré', () => {
    const frames = [
      { id: 'a', name: 'A', type: 'FRAME', tracked: true,  nodes: 100 },
      { id: 'b', name: 'B', type: 'FRAME', tracked: false, nodes: 0 },
      { id: 'c', name: 'C', type: 'FRAME', tracked: true,  nodes: 50 },
    ];
    expect(estimateMs(frames)).toBe(150 * MS_PER_NODE);
  });

  it('aucune frame suivie → 0', () => {
    expect(estimateMs([{ id: 'a', name: 'A', type: 'FRAME', tracked: false, nodes: 0 }])).toBe(0);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run : `cd plugin && npx vitest run src/trackedFrames.test.ts`
Expected : FAIL — le module `./trackedFrames.js` n'existe pas.

- [ ] **Step 3 : Implémenter**

Créer `plugin/src/trackedFrames.ts` :

```ts
// Découverte et suivi des frames d'une page. Le marquage vit dans le pluginData de la
// frame (comme dg_id) : il voyage avec le fichier et vaut pour tous les éditeurs.
//
// Logique PURE, testable sans Figma : `TrackableNode` est un sous-ensemble structurel de
// SceneNode, sur le modèle de `IdentifiableNode` (figmaIdentity.ts).

export interface TrackableNode {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
  readonly children?: readonly TrackableNode[];
}

export const TRACKED_KEY = 'dg_tracked';

/** Taux d'extraction MESURÉ (spikes 2 et 3 : 2 à 3 ms/nœud). Borne haute : on sur-estime
 *  plutôt que de sur-promettre à l'utilisateur. */
export const MS_PER_NODE = 3;

/** Au-delà, l'UI avertit : le périmètre devient long à capturer. */
export const WARN_MS = 10_000;

export interface FrameEntry {
  id: string;
  name: string;
  type: string;
  tracked: boolean;
  nodes: number; // 0 pour une frame non suivie — elle n'est pas traversée
}

export function isTracked(n: TrackableNode): boolean {
  return n.getPluginData(TRACKED_KEY) === '1';
}

export function setTracked(n: TrackableNode, on: boolean): void {
  try { n.setPluginData(TRACKED_KEY, on ? '1' : ''); } catch { /* viewer read-only */ }
}

export function countNodes(n: TrackableNode): number {
  let total = 1;
  for (const c of n.children ?? []) total += countNodes(c);
  return total;
}

/**
 * Liste TOUTES les frames de premier niveau — l'utilisateur doit voir ce qu'il ne suit pas,
 * sinon l'omission redevient silencieuse. Seules les frames suivies sont traversées pour
 * être comptées : la traversée coûte ~0,13 ms/nœud, donc compter les 331 frames d'une page
 * réelle prendrait ~2 s et rendrait la liste poussive.
 */
export function listFrames(children: readonly TrackableNode[]): FrameEntry[] {
  return children.map(n => {
    const tracked = isTracked(n);
    return { id: n.id, name: n.name, type: n.type, tracked, nodes: tracked ? countNodes(n) : 0 };
  });
}

/** Coût d'extraction estimé du périmètre suivi, en millisecondes. */
export function estimateMs(frames: readonly FrameEntry[]): number {
  return frames.reduce((sum, f) => sum + (f.tracked ? f.nodes : 0), 0) * MS_PER_NODE;
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run : `cd plugin && npx vitest run src/trackedFrames.test.ts`
Expected : PASS (9 tests).

- [ ] **Step 5 : Vérifier l'absence de régression**

Run : `cd plugin && npx vitest run && npx tsc --noEmit`
Expected : 139 tests PASS (130 + 9), typecheck silencieux.

- [ ] **Step 6 : Commiter**

```bash
git add plugin/src/trackedFrames.ts plugin/src/trackedFrames.test.ts
git commit -m "feat(page-centric): module trackedFrames — découverte, suivi, estimation"
```

---

## Task 2 : Messages et découverte côté main thread

**Files:**
- Modify : `plugin/src/types.ts`
- Modify : `plugin/src/main.ts`

**Interfaces:**
- Consumes : `listFrames`, `setTracked`, `FrameEntry` (Task 1)
- Produces : trois messages —
  - UI→main `{ type: 'REQUEST_FRAMES' }`
  - UI→main `{ type: 'SET_TRACKED'; nodeId: string; tracked: boolean }`
  - main→UI `{ type: 'FRAMES_LIST'; frames: FrameEntry[]; pageName: string; capturable: boolean }`

`capturable` est `false` sur une page `dg/*` — l'UI doit pouvoir expliquer pourquoi la capture est refusée **avant** que l'utilisateur clique.

- [ ] **Step 1 : Déclarer les messages**

Dans `plugin/src/types.ts`, ajouter à `MainToUI` :

```ts
  | { type: 'FRAMES_LIST'; frames: FrameEntry[]; pageName: string; capturable: boolean }
```

et à `UIToMain` :

```ts
  | { type: 'REQUEST_FRAMES' }
  | { type: 'SET_TRACKED'; nodeId: string; tracked: boolean }
```

Puis importer le type en tête du fichier :

```ts
import type { FrameEntry } from './trackedFrames.js';
```

- [ ] **Step 2 : Implémenter les handlers**

Dans `plugin/src/main.ts`, ajouter l'import :

```ts
import { listFrames, setTracked, type TrackableNode } from './trackedFrames.js';
```

Puis, dans le `switch` de `figma.ui.onmessage`, avant l'accolade fermante :

```ts
    case 'REQUEST_FRAMES': sendFrames(); break;

    case 'SET_TRACKED': {
      const node = figma.currentPage.children.find(c => c.id === msg.nodeId);
      if (node) setTracked(node as unknown as TrackableNode, msg.tracked);
      sendFrames(); // renvoie la liste à jour : l'estimation se recalcule côté UI
      break;
    }
```

Et ajouter la fonction, après le `switch` :

```ts
// Le préfixe `dg/` est réservé aux pages techniques (branches + _history) : jamais capturable.
function isCapturablePage(name: string): boolean {
  return !name.startsWith('dg/');
}

function sendFrames(): void {
  const page = figma.currentPage;
  send({
    type: 'FRAMES_LIST',
    frames: listFrames(page.children as unknown as readonly TrackableNode[]),
    pageName: page.name,
    capturable: isCapturablePage(page.name),
  });
}
```

- [ ] **Step 3 : Vérifier la compilation et l'absence de régression**

Run : `cd plugin && npx tsc --noEmit && npx vitest run`
Expected : typecheck silencieux, 139 tests PASS.

- [ ] **Step 4 : Commiter**

```bash
git add plugin/src/types.ts plugin/src/main.ts
git commit -m "feat(page-centric): messages de découverte et de suivi des frames"
```

---

## Task 3 : Écran de liste des frames

**Files:**
- Modify : `plugin/src/ui.tsx`

**Interfaces:**
- Consumes : messages `FRAMES_LIST` / `REQUEST_FRAMES` / `SET_TRACKED` (Task 2), `estimateMs`, `WARN_MS` (Task 1)
- Produces : un composant `FramesPanel` monté dans `HomeScreen`, au-dessus du bouton de capture.

- [ ] **Step 1 : Écrire le composant**

Dans `plugin/src/ui.tsx`, ajouter l'import :

```ts
import { estimateMs, WARN_MS, type FrameEntry } from './trackedFrames.js';
```

Puis le composant, avant `function VersionRow` :

```tsx
// Liste TOUTES les frames de la page : l'utilisateur doit voir ce qu'il ne suit pas.
// L'estimation du coût est affichée en continu — c'est le garde-fou qui l'empêche de
// reconstruire sans s'en rendre compte le mur mesuré au spike (93,8 s sur 331 frames).
function FramesPanel() {
  const [frames, setFrames] = useState<FrameEntry[]>([]);
  const [pageName, setPageName] = useState('');
  const [capturable, setCapturable] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    const h = (e: MessageEvent) => {
      const m = (e.data?.pluginMessage ?? e.data) as {
        type?: string; frames?: FrameEntry[]; pageName?: string; capturable?: boolean;
      };
      if (m?.type !== 'FRAMES_LIST' || !m.frames) return;
      setFrames(m.frames);
      setPageName(m.pageName ?? '');
      setCapturable(m.capturable ?? true);
    };
    window.addEventListener('message', h);
    send({ type: 'REQUEST_FRAMES' });
    return () => window.removeEventListener('message', h);
  }, []);

  const tracked = frames.filter(f => f.tracked);
  const ms = estimateMs(frames);
  const nodes = tracked.reduce((s, f) => s + f.nodes, 0);
  const shown = q ? frames.filter(f => f.name.toLowerCase().includes(q.toLowerCase())) : frames;

  if (!capturable) {
    return (
      <p class="text-xs text-amber-400 px-1">
        La page « {pageName} » est une page technique Design Guardian : elle n'est pas suivie.
      </p>
    );
  }

  return (
    <div class="flex flex-col gap-1.5">
      <div class="flex items-baseline justify-between">
        <span class="text-xs text-gray-400">{tracked.length} / {frames.length} frames suivies</span>
        <span class={`text-[11px] ${ms >= WARN_MS ? 'text-amber-400' : 'text-gray-500'}`}>
          {tracked.length === 0 ? 'aucune' : `~${nodes} calques · ~${(ms / 1000).toFixed(1)} s`}
        </span>
      </div>

      {ms >= WARN_MS && (
        <p role="alert" class="text-[11px] text-amber-400">
          Périmètre large : la capture gèlera Figma pendant l'extraction. Retire des frames pour l'accélérer.
        </p>
      )}

      {frames.length > 8 && (
        <input
          type="search" value={q} placeholder="Filtrer les frames…"
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          class="w-full px-2 py-1 rounded text-xs bg-gray-900 border border-gray-800 text-gray-200"
        />
      )}

      <div class="max-h-40 overflow-auto flex flex-col">
        {shown.map(f => (
          <label key={f.id} class="flex items-center gap-2 px-1 py-0.5 text-xs hover:bg-gray-900 cursor-pointer">
            <input
              type="checkbox" checked={f.tracked}
              onChange={() => send({ type: 'SET_TRACKED', nodeId: f.id, tracked: !f.tracked })}
            />
            <span class={`flex-1 truncate ${f.tracked ? 'text-gray-200' : 'text-gray-500'}`}>{f.name}</span>
            {f.tracked && <span class="text-[10px] text-gray-600">{f.nodes}</span>}
          </label>
        ))}
        {shown.length === 0 && <p class="text-[11px] text-gray-600 px-1 py-1">Aucune frame ne correspond.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Monter le composant et conditionner la capture**

Dans `HomeScreen`, remplacer le bloc du bouton de capture par :

```tsx
        <FramesPanel />
        <button class="btn-primary w-full" onClick={() => send({ type: 'REQUEST_SNAPSHOT' })} disabled={plan === 'free' && versions.length >= 10}>
          Capturer un checkpoint
        </button>
```

- [ ] **Step 3 : Vérifier la compilation et le rendu**

Run : `cd plugin && npx tsc --noEmit && npx vitest run && npm run build`
Expected : typecheck silencieux, 139 tests PASS, build OK.

- [ ] **Step 4 : Commiter**

```bash
git add plugin/src/ui.tsx
git commit -m "feat(page-centric): écran de liste des frames avec estimation du coût"
```

---

## Task 4 : Capture des frames suivies

**Files:**
- Modify : `plugin/src/main.ts`

**Interfaces:**
- Consumes : `isTracked`, `TrackableNode` (Task 1), `isCapturablePage` (Task 2), `ensureNodeIdentity` (existant), `extractSnapshot` (existant, **inchangée**)
- Produces : `handleSnapshot()` capture la page courante restreinte aux frames suivies.

- [ ] **Step 1 : Remplacer le corps de `handleSnapshot`**

Dans `plugin/src/main.ts`, remplacer le début de `handleSnapshot` (la garde de sélection et la construction du snapshot) par :

```ts
async function handleSnapshot(): Promise<void> {
  const page = figma.currentPage;

  if (!isCapturablePage(page.name)) {
    send({ type: 'ERROR', message: `« ${page.name} » est une page technique Design Guardian : elle ne peut pas être capturée.` });
    return;
  }

  const tracked = page.children.filter(c => isTracked(c as unknown as TrackableNode));
  if (tracked.length === 0) {
    send({ type: 'ERROR', message: 'Aucune frame suivie. Coche les frames à suivre dans la liste, puis relance la capture.' });
    return;
  }

  await ensurePagesLoaded(); // dynamic-page : requis avant le clone d'historique

  const figmaSnapshot: FigmaSnapshot = {
    figmaNodeId: page.id,
    figmaNodeName: page.name,
    capturedAt: new Date().toISOString(),
    root: {
      // CRITIQUE : sans dg_id sur la racine, compareSnapshots calcule useDgId = false et
      // désactive le matching par dg_id pour TOUTE la page (repli silencieux sur id:/path:).
      dg_id: ensureNodeIdentity(page as unknown as Parameters<typeof ensureNodeIdentity>[0]),
      id: page.id,
      name: page.name,
      type: 'PAGE',
      // Géométrie CONSTANTE : c'est ce qui garantit que la racine ne produit aucun diff.
      // Une PageNode n'a de toute façon aucune géométrie (elle n'étend pas LayoutMixin).
      x: 0, y: 0, width: 0, height: 0,
      opacity: 1, fills: [], strokes: [],
      children: tracked.map(extractSnapshot),
    },
  };
```

- [ ] **Step 2 : Traiter les usages restants de `node`**

La suite de `handleSnapshot` utilise `node` pour **deux** choses : `storeHistoryClonePending(node)` et l'export de l'aperçu (`exportAsync` sur `node`). Introduire une frame de référence juste après la construction du snapshot :

```ts
  // Aperçu et clone d'historique PROVISOIRES : rattachés à la première frame suivie.
  // Le rendu par frame modifiée et le clone borné relèvent des Phases 3 et 4 ; en
  // attendant, le viewer existant doit continuer à afficher quelque chose plutôt que
  // « Rendu indisponible » sur chaque capture page.
  const primary = tracked[0];
```

puis remplacer, dans tout le reste de la fonction, `node` par `primary` — c'est-à-dire `storeHistoryClonePending(primary)`, `if ('exportAsync' in primary)` et `primary as ExportMixin`.

⚠️ L'envoi final `SNAPSHOT_READY` doit porter `nodeId: page.id` (et **non** `primary.id`) : c'est l'identifiant du checkpoint, qui est désormais la page.

- [ ] **Step 3 : Vérifier la compilation et l'absence de régression**

Run : `cd plugin && npx tsc --noEmit && npx vitest run`
Expected : typecheck silencieux, 139 tests PASS.

- [ ] **Step 4 : Vérifier à la main dans Figma**

Construire (`npm run build`), recharger le plugin, puis vérifier les trois comportements :
1. Sur une page `dg/*` → message d'erreur explicite, aucune capture.
2. Sans frame cochée → message invitant à en cocher.
3. Avec 2 frames cochées → la capture aboutit et la version créée contient bien **deux** viewports.

- [ ] **Step 5 : Commiter**

```bash
git add plugin/src/main.ts
git commit -m "feat(page-centric): capture des frames suivies, sans sélection"
```

---

## Task 5 : Classification `scope_in` / `scope_out`

**Files:**
- Create : `backend/src/services/scope.service.ts`
- Test : `backend/src/tests/scope.service.test.ts`
- Modify : `backend/src/types/figma.ts`
- Modify : `backend/src/controllers/checkpoints.controller.ts`
- Modify : `backend/src/controllers/versions.controller.ts`

**Interfaces:**
- Consumes : `viewportRootMap` (Phase 1), `DeltaJSON`, `FigmaSnapshot`
- Produces : `classifyScopeChanges(delta, currentSnap, prevSnap): DeltaJSON` — purge de `added`/`removed` les nœuds appartenant à une frame entrée ou sortie du périmètre, et les recense dans `scopeIn` / `scopeOut`.

> **Pourquoi.** Cocher ou décocher une frame entre deux checkpoints la ferait apparaître comme **ajoutée** ou **supprimée**, avec tous ses descendants — alors que le design n'a pas bougé. Le changelog mentirait, et massivement : une frame de 500 calques décochée produirait 500 fausses suppressions.

- [ ] **Step 1 : Étendre le type**

Dans `backend/src/types/figma.ts`, dans `DeltaJSON`, après `viewports` :

```ts
  // Page-centric : frames entrées/sorties du périmètre de suivi entre deux checkpoints.
  // JAMAIS confondues avec added/removed — le design n'a pas changé, le périmètre si.
  scopeIn?:  Array<{ id: string; name: string }>;
  scopeOut?: Array<{ id: string; name: string }>;
```

- [ ] **Step 2 : Écrire les tests qui échouent**

Créer `backend/src/tests/scope.service.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { classifyScopeChanges } from '../services/scope.service.js';
import type { DeltaJSON, FigmaSnapshot } from '../types/figma.js';

const frame = (id: string, name: string, childId: string) => ({
  id, name, type: 'FRAME', x: 0, y: 0, width: 100, height: 100, opacity: 1, fills: [], strokes: [],
  children: [{ id: childId, name: childId, type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10, opacity: 1, fills: [], strokes: [], children: [] }],
});

const page = (frames: ReturnType<typeof frame>[]): FigmaSnapshot => ({
  figmaNodeId: 'page', figmaNodeName: 'P', capturedAt: '2026-01-01T00:00:00Z',
  root: { id: 'page', name: 'P', type: 'PAGE', x: 0, y: 0, width: 0, height: 0, opacity: 1, fills: [], strokes: [], children: frames },
} as unknown as FigmaSnapshot);

const delta = (over: Partial<DeltaJSON>): DeltaJSON => ({
  modified: [], added: [], removed: [], totalChanges: 0,
  metadata: { v1CapturedAt: '', v2CapturedAt: '', epsilon: 0.01, processingTimeMs: 0 },
  ...over,
} as DeltaJSON);

describe('classifyScopeChanges', () => {
  it('une frame nouvellement suivie est scopeIn, pas added — ses nœuds sont purgés', () => {
    const prev = page([frame('a', 'Accueil', 'a1')]);
    const cur  = page([frame('a', 'Accueil', 'a1'), frame('b', 'Panier', 'b1')]);
    const d = delta({ added: [
      { nodeId: 'b',  nodeName: 'Panier', nodeType: 'FRAME', changes: [] },
      { nodeId: 'b1', nodeName: 'b1',     nodeType: 'RECTANGLE', changes: [] },
    ] });
    const out = classifyScopeChanges(d, cur, prev);
    expect(out.scopeIn).toEqual([{ id: 'b', name: 'Panier' }]);
    expect(out.added).toHaveLength(0);
  });

  it('une frame retirée du suivi est scopeOut, pas removed', () => {
    const prev = page([frame('a', 'Accueil', 'a1'), frame('b', 'Panier', 'b1')]);
    const cur  = page([frame('a', 'Accueil', 'a1')]);
    const d = delta({ removed: [
      { nodeId: 'b',  nodeName: 'Panier', nodeType: 'FRAME', changes: [] },
      { nodeId: 'b1', nodeName: 'b1',     nodeType: 'RECTANGLE', changes: [] },
    ] });
    const out = classifyScopeChanges(d, cur, prev);
    expect(out.scopeOut).toEqual([{ id: 'b', name: 'Panier' }]);
    expect(out.removed).toHaveLength(0);
  });

  it('un VRAI ajout dans une frame déjà suivie reste added', () => {
    const prev = page([frame('a', 'Accueil', 'a1')]);
    const cur  = page([frame('a', 'Accueil', 'a1')]);
    const d = delta({ added: [{ nodeId: 'a2', nodeName: 'Nouveau', nodeType: 'RECTANGLE', changes: [] }] });
    const out = classifyScopeChanges(d, cur, prev);
    expect(out.added.map(n => n.nodeId)).toEqual(['a2']);
    expect(out.scopeIn ?? []).toHaveLength(0);
  });

  it('mode frame (racine non-PAGE) : delta rendu tel quel', () => {
    const frameSnap = { root: { id: 'f', name: 'F', type: 'FRAME', children: [] } } as unknown as FigmaSnapshot;
    const d = delta({ added: [{ nodeId: 'x', nodeName: 'X', nodeType: 'RECTANGLE', changes: [] }] });
    const out = classifyScopeChanges(d, frameSnap, frameSnap);
    expect(out.added).toHaveLength(1);
    expect(out.scopeIn).toBeUndefined();
  });

  it('pas de snapshot précédent (v1) : delta rendu tel quel', () => {
    const cur = page([frame('a', 'Accueil', 'a1')]);
    const d = delta({ added: [{ nodeId: 'a1', nodeName: 'a1', nodeType: 'RECTANGLE', changes: [] }] });
    const out = classifyScopeChanges(d, cur, null);
    expect(out.added).toHaveLength(1);
    expect(out.scopeIn).toBeUndefined();
  });
});
```

- [ ] **Step 3 : Lancer les tests pour vérifier l'échec**

Run : `cd backend && npx vitest run src/tests/scope.service.test.ts`
Expected : FAIL — le module `scope.service.js` n'existe pas.

- [ ] **Step 4 : Implémenter**

Créer `backend/src/services/scope.service.ts` :

```ts
import type { DeltaJSON, FigmaSnapshot } from '../types/figma.js';
import { viewportRootMap } from './tree.service.js';

/**
 * Sépare les changements de PÉRIMÈTRE des changements de DESIGN.
 *
 * Cocher ou décocher une frame entre deux checkpoints la ferait apparaître comme ajoutée
 * ou supprimée, avec tous ses descendants — alors que rien n'a bougé dans le design. Une
 * frame de 500 calques décochée produirait 500 fausses suppressions.
 *
 * Les frames suivies sont exactement les enfants de la racine synthétique : la comparaison
 * des deux listes donne les entrées et sorties de périmètre, et les nœuds qui en dépendent
 * sont retirés de `added`/`removed`.
 *
 * Non-mutant. Sans effet hors page-centric (racine non-PAGE) ou sans version précédente.
 */
export function classifyScopeChanges(
  delta: DeltaJSON,
  currentSnap: FigmaSnapshot,
  prevSnap: FigmaSnapshot | null,
): DeltaJSON {
  if (!prevSnap || currentSnap.root.type !== 'PAGE' || prevSnap.root.type !== 'PAGE') return delta;

  const cur  = new Map((currentSnap.root.children ?? []).map(c => [c.id, c.name]));
  const prev = new Map((prevSnap.root.children ?? []).map(c => [c.id, c.name]));

  const scopeIn  = [...cur].filter(([id]) => !prev.has(id)).map(([id, name]) => ({ id, name }));
  const scopeOut = [...prev].filter(([id]) => !cur.has(id)).map(([id, name]) => ({ id, name }));
  if (scopeIn.length === 0 && scopeOut.length === 0) return delta;

  const inIds  = new Set(scopeIn.map(f => f.id));
  const outIds = new Set(scopeOut.map(f => f.id));
  const curVp  = viewportRootMap(currentSnap.root);
  const prevVp = viewportRootMap(prevSnap.root);

  return {
    ...delta,
    added:   delta.added.filter(n   => !inIds.has(curVp.get(n.nodeId)?.id  ?? '')),
    removed: delta.removed.filter(n => !outIds.has(prevVp.get(n.nodeId)?.id ?? '')),
    ...(scopeIn.length  > 0 ? { scopeIn }  : {}),
    ...(scopeOut.length > 0 ? { scopeOut } : {}),
  };
}
```

- [ ] **Step 5 : Lancer les tests pour vérifier le succès**

Run : `cd backend && npx vitest run src/tests/scope.service.test.ts`
Expected : PASS (5 tests).

- [ ] **Step 6 : Brancher dans les deux pipelines**

Dans `backend/src/controllers/checkpoints.controller.ts`, ajouter l'import :

```ts
import { classifyScopeChanges } from '../services/scope.service.js';
```

puis envelopper le delta (l'ordre compte : on classe **avant** d'enrichir, pour ne pas enrichir des nœuds qu'on va retirer) :

```ts
      const delta = enrichDeltaGeometry(
        classifyScopeChanges(
          stampSignificance(rawDelta, body.snapshot_json as FigmaSnapshot),
          body.snapshot_json as FigmaSnapshot, prevSnapshot ?? null,
        ),
        body.snapshot_json as FigmaSnapshot, prevSnapshot ?? null,
      );
```

Dans `backend/src/controllers/versions.controller.ts` (chemin restore), même import, et :

```ts
      const delta = enrichDeltaGeometry(
        classifyScopeChanges(stampSignificance(rawDelta, snapshot), snapshot, headSnap ?? null),
        snapshot, headSnap ?? null,
      );
```

- [ ] **Step 7 : Exposer au plugin**

Dans `backend/src/controllers/versions.controller.ts`, dans la réponse JSON du `GET /versions/:id`, après `viewports` :

```ts
    scope_in:  delta?.scopeIn  ?? null,
    scope_out: delta?.scopeOut ?? null,
```

- [ ] **Step 8 : Vérifier l'absence de régression globale**

Run : `cd backend && npx vitest run && npx tsc --noEmit`
Expected : 219 tests PASS (214 + 5), typecheck silencieux.

- [ ] **Step 9 : Commiter**

```bash
git add backend/src/services/scope.service.ts backend/src/tests/scope.service.test.ts backend/src/types/figma.ts backend/src/controllers/checkpoints.controller.ts backend/src/controllers/versions.controller.ts
git commit -m "feat(page-centric): sépare les changements de périmètre des changements de design"
```

---

## Task 6 : Asset `scope = 'page'`

**Files:**
- Modify : `backend/src/types/api.ts`
- Modify : `backend/src/controllers/assets.controller.ts`

**Interfaces:**
- Consumes : colonne `assets.scope` (migration 018, Phase 1)
- Produces : `POST /api/assets` accepte un champ optionnel `scope` (`'frame' | 'page'`, défaut `'frame'`).

> **Pourquoi un champ explicite.** Un id de page Figma n'est pas distinguable d'un id de nœud : le serveur ne peut pas déduire l'unité de capture. C'est au client de la déclarer.

- [ ] **Step 1 : Étendre le schéma Zod**

Dans `backend/src/types/api.ts`, dans `createAssetSchema`, ajouter :

```ts
  scope: z.enum(['frame', 'page']).optional(),
```

> ⚠️ Rappel projet : un champ absent du schéma Zod est **supprimé silencieusement** du corps validé. C'est la cause historique de plusieurs bugs de données ici — d'où cette étape avant toute autre.

- [ ] **Step 2 : Écrire le test qui échoue**

Il n'existe pas de `assets.controller.test.ts`, et monter le mock Supabase complet pour cette seule vérification serait disproportionné. On teste **le schéma directement** — c'est d'ailleurs le test le plus ciblé, puisque le risque est précisément que Zod supprime le champ en silence.

Créer `backend/src/tests/api.schema.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createAssetSchema } from '../types/api.js';

describe('createAssetSchema — scope', () => {
  it('conserve scope=page (sinon Zod le supprimerait en silence)', () => {
    const parsed = createAssetSchema.parse({ name: 'Écrans app', asset_type: 'ui', scope: 'page' });
    expect(parsed.scope).toBe('page');
  });

  it('scope absent reste accepté (la base applique le défaut frame)', () => {
    const parsed = createAssetSchema.parse({ name: 'Logo', asset_type: 'logo' });
    expect(parsed.scope).toBeUndefined();
  });

  it('rejette une valeur de scope inconnue', () => {
    expect(() => createAssetSchema.parse({ name: 'X', asset_type: 'ui', scope: 'calque' })).toThrow();
  });
});
```

- [ ] **Step 3 : Lancer le test pour vérifier l'échec**

Run : `cd backend && npx vitest run src/tests/api.schema.test.ts`
Expected : FAIL — `parsed.scope` vaut `undefined` alors que `'page'` était fourni, exactement le mode de défaillance redouté.

- [ ] **Step 4 : Implémenter puis relancer**

L'ajout du champ au schéma (Step 1) suffit : l'insertion existante `.insert({ ...body, project_id, description })` propage déjà `scope` une fois le champ validé. Aucune autre modification.

Run : `cd backend && npx vitest run src/tests/api.schema.test.ts`
Expected : PASS (3 tests).

- [ ] **Step 5 : Vérifier l'absence de régression globale**

Run : `cd backend && npx vitest run && npx tsc --noEmit`
Expected : 222 tests PASS (214 + 5 + 3), typecheck silencieux.

- [ ] **Step 6 : Commiter**

```bash
git add backend/src/types/api.ts backend/src/tests/api.schema.test.ts
git commit -m "feat(page-centric): création d'asset avec scope=page"
```

---

## Fin de la Phase 2 — état attendu

- **222 tests backend + 139 tests plugin = 361**, tous verts.
- L'utilisateur voit **toutes** les frames de sa page, coche celles qu'il suit, et lit en continu le coût estimé de sa prochaine capture.
- La capture ne demande **aucune sélection** et produit un checkpoint couvrant toutes les frames suivies.
- Un changement de périmètre n'est **jamais** présenté comme un changement de design.
- Les pages `dg/*` sont refusées avec un message explicite.

**Ce qui reste invisible** : le viewer affiche encore le diff à l'ancienne. La liste des frames dans le viewer et les rendus par frame arrivent en Phase 3.

## Suite

- **Phase 3** — liste des frames dans le viewer (depuis `viewports[]`, déjà livré en Phase 1), affichage des entrées/sorties de périmètre, et **rendus par frame modifiée** (déplacés depuis la Phase 2).
- **Phase 4** — restore par frame + clones bornés aux frames modifiées.
- **Lot séparé** — balayage géométrique (§ « O2 ») : détecter automatiquement qu'une frame **non suivie** a changé structurellement, et proposer de la suivre. C'est la vraie réponse au renoncement de couverture ; mesuré à ~4 s pour 14 896 nœuds.
