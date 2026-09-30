# Nouvelle UI du plugin — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** une UI « Figma natif » avec résumé IA en vedette, sans écran d'asset ni onglets de branches, dont la direction visuelle tient dans un seul fichier de jetons.

**Architecture :** on découpe d'abord `plugin/src/ui.tsx` (1 437 lignes) en modules sans changer le comportement, puis on pose les jetons de thème (variables Figma via `themeColors`), on remplace l'écran d'asset par un choix automatique de l'historique (logique pure testée), et on redessine chaque écran sur les jetons. Backend, store (hors type `Screen`), capture, diff et restauration inchangés.

**Tech Stack :** Preact 10, Tailwind CSS 4 (`@tailwindcss/vite`), Zustand, Vite, Vitest 4, API plugin Figma.

**Spec :** `docs/conception/specs/2026-10-01-nouvelle-ui-design.md`

## Global Constraints

- TypeScript strict, zéro `any`.
- `figma.*` uniquement dans `main.ts` ; appels HTTP uniquement côté UI.
- Manifest Figma : ne JAMAIS ajouter la permission `"exports"`.
- Aucune couleur Tailwind en dur (`gray-*`, `purple-*`, `green-*`, `amber-*`, `red-*`, `blue-*`, `white`, `black`) dans `src/ui.tsx` et `src/ui/**` à la fin du plan : tout passe par les jetons `dg-*` de `src/theme.css`.
- Offre : Free et Pro uniquement (Team abandonné, arbitrage 2026-09-07).
- Branche toujours `main`, implicite ; les versions d'autres branches restent en base mais ne sont plus affichées.
- Vérification : `npx vitest run` et `npx tsc --noEmit` dans `plugin/`. Pas de `vite build` pour vérifier (seulement pour le test manuel Figma, tâche 8).
- Indexer nommément (`git add <fichiers>`), jamais `git add -A`.
- Textes d'interface en français.

## Review Focus

1. Fichier sans historique et création impossible (serveur injoignable) → écran de chargement avec « Réessayer », jamais un écran vide ni une boucle de créations.
2. Dernier historique mémorisé supprimé ou déplacé par une séparation → repli sur le plus récent, sans erreur.
3. Réponse du cache (stale) puis réponse fraîche : un utilisateur déjà sur l'accueil n'est pas renvoyé ailleurs si son historique existe toujours.
4. Thème clair de Figma : aucun texte illisible (reste de couleur en dur).
5. Séparation de projet réussie : l'historique courant, présent dans le nouveau projet, reste ouvert ; le fichier mémorise le nouvel identifiant.

Tests associés : 1-3 et 5 → `ensureHistory`/`pickHistory` (tâche 3) ; 4 → garde `noHardcodedColors.test.ts` (tâche 7).

---

### Task 1 : Découper `ui.tsx` sans changer le comportement

**Files :**
- Create : `plugin/src/ui/api.ts`, `plugin/src/ui/components/common.tsx`, `plugin/src/ui/components/AccountLink.tsx`, `plugin/src/ui/components/FramesPanel.tsx`, `plugin/src/ui/components/VersionRow.tsx`, `plugin/src/ui/screens/Loading.tsx`, `plugin/src/ui/screens/Assets.tsx`, `plugin/src/ui/screens/Home.tsx`, `plugin/src/ui/screens/FrameHistory.tsx`, `plugin/src/ui/screens/Checkpoint.tsx`, `plugin/src/ui/screens/Upgrade.tsx`, `plugin/src/ui/diff/DiffScreen.tsx`, `plugin/src/ui/diff/DiffCanvas.tsx`, `plugin/src/ui/diff/NodeDetail.tsx`, `plugin/src/ui/diff/DiffChips.tsx`
- Modify : `plugin/src/ui.tsx` (ne garde que `initSentry`, `App`, `render`)

**Interfaces :**
- Produces :
  - `ui/api.ts` : `API_BASE: string`, `session: { linkToken: string | null; fileName: string; fileKey: string; lastAssetId: string | null }`, `api<T>(key: string, path: string, opts?: RequestInit): Promise<T>`, `send(msg: UIToMain): void`, `maxPlan(a: Plan, b: Plan): Plan`.
  - `ui/diff/DiffScreen.tsx` : `DiffScreen`, `clearDiffCache(): void`.
  - Chaque écran exporte son composant sous son nom actuel (`LoadingScreen`, `AssetsScreen`, `HomeScreen`, `FrameHistoryScreen`, `CheckpointScreen`, `DiffScreen`) ; `UpgradeScreen({ onBack }: { onBack: () => void })` est le JSX `showUpgrade` extrait tel quel.

- [ ] **Step 1 : créer `ui/api.ts`**

```ts
// Accès réseau et messagerie vers le main thread (UI THREAD — aucun accès API Figma ici).
import type { UIToMain } from '../types.js';
import type { Plan } from '../store.js';

// Surchargeable au build (VITE_API_BASE) pour tester contre un backend local.
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://design-guardian.up.railway.app';

// État de session partagé entre écrans, hors store (non réactif, lu au moment de l'appel).
export const session = {
  linkToken: null as string | null,
  fileName: '',            // nom du fichier Figma ouvert
  fileKey: '',             // identifiant du fichier (dg_file_id)
  lastAssetId: null as string | null, // dernier historique utilisé dans ce fichier
};

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, team: 2 };
export function maxPlan(a: Plan, b: Plan): Plan { return PLAN_RANK[a] >= PLAN_RANK[b] ? a : b; }

export async function api<T>(key: string, path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'X-API-Key': key, 'Content-Type': 'application/json',
      ...(session.linkToken ? { 'X-Link-Token': session.linkToken } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error: string; details?: string };
    throw new Error(body.details ? `${body.error}: ${body.details}` : body.error);
  }
  return res.json() as Promise<T>;
}

export function send(msg: UIToMain) { parent.postMessage({ pluginMessage: msg }, '*'); }
```

- [ ] **Step 2 : déplacer les composants** — couper/coller chaque fonction de `ui.tsx` dans son fichier, **sans modifier son corps**, en ajoutant `export` :

| Fichier | Contenu déplacé (lignes actuelles de `ui.tsx`) |
|--|--|
| `ui/components/common.tsx` | `Logo`, `Topbar`, `Spinner` (1412-1435) |
| `ui/components/AccountLink.tsx` | `AccountLink` (56-107) |
| `ui/components/FramesPanel.tsx` | `FramesPanel` et son commentaire (557-649) |
| `ui/components/VersionRow.tsx` | `VersionRow` (678-707) |
| `ui/screens/Loading.tsx` | `LoadingScreen` (269-287) |
| `ui/screens/Assets.tsx` | `ASSET_TYPES`, `AssetsScreen` (291-402) |
| `ui/screens/Home.tsx` | `HomeScreen` (406-555) |
| `ui/screens/FrameHistory.tsx` | `FrameHistoryScreen` (653-676) |
| `ui/screens/Checkpoint.tsx` | `CheckpointScreen` (711-857) |
| `ui/screens/Upgrade.tsx` | le JSX de `if (showUpgrade) return (…)` (233-255) dans `export function UpgradeScreen({ onBack })`, `setShowUpgrade(false)` → `onBack()` |
| `ui/diff/DiffScreen.tsx` | `diffCache`, `clearDiffCache`, `svgCache` (export), `useDiffLoader`, `buildRestoreMsg`, `useRestoreListener`, `useCycleStatus`, `useApplyToFigma`, `useRestore`, `DiffScreen` (861-1176) |
| `ui/diff/DiffCanvas.tsx` | `NodeCrop`, `FrameImage`, `TONE_CLASS`, `HighlightCanvas` (1180-1304) ; `FrameImage` importe `svgCache` de `./DiffScreen.js` |
| `ui/diff/NodeDetail.tsx` | `NodeDetail` (1306-1381) |
| `ui/diff/DiffChips.tsx` | `DiffChips` (1383-1408) |

Remplacements mécaniques dans le code déplacé : `currentLinkToken` → `session.linkToken`, `currentFileName` → `session.fileName`. Chaque fichier importe exactement ce qu'il utilise (hooks Preact, `useAppStore`, `appStore`, types, `api`/`send`/`session`, utilitaires) ; `tsc --noEmit` signale tout import manquant ou inutilisé.

- [ ] **Step 3 : réduire `ui.tsx`** à : imports, `initSentry()`, `import './ui.css'`, `App` (corps inchangé sauf `if (showUpgrade) return <UpgradeScreen onBack={() => setShowUpgrade(false)} />;` et les remplacements `session.*`), `render(h(App, null), document.body);`.

- [ ] **Step 4 : vérifier**

Run : `cd plugin && npx tsc --noEmit && npx vitest run`
Expected : aucune erreur de type ; `Tests  194 passed (194)`.

- [ ] **Step 5 : commit**

```bash
git add plugin/src/ui.tsx plugin/src/ui/api.ts plugin/src/ui/components/common.tsx plugin/src/ui/components/AccountLink.tsx plugin/src/ui/components/FramesPanel.tsx plugin/src/ui/components/VersionRow.tsx plugin/src/ui/screens/Loading.tsx plugin/src/ui/screens/Assets.tsx plugin/src/ui/screens/Home.tsx plugin/src/ui/screens/FrameHistory.tsx plugin/src/ui/screens/Checkpoint.tsx plugin/src/ui/screens/Upgrade.tsx plugin/src/ui/diff/DiffScreen.tsx plugin/src/ui/diff/DiffCanvas.tsx plugin/src/ui/diff/NodeDetail.tsx plugin/src/ui/diff/DiffChips.tsx
git commit -m "refactor(plugin): découpage de l'UI en écrans et composants"
```

---

### Task 2 : Jetons de thème (variables Figma)

**Files :**
- Create : `plugin/src/theme.css`
- Modify : `plugin/src/ui.css`, `plugin/src/main.ts:24`

**Interfaces :**
- Produces : utilitaires Tailwind `bg-dg-bg`, `bg-dg-raised`, `bg-dg-hover`, `bg-dg-selected`, `text-dg-text`, `text-dg-text-2`, `text-dg-text-3`, `border-dg-border`, `bg-dg-accent`, `text-dg-accent-text`, `text-dg-on-accent`, `text-dg-success`, `text-dg-warning`, `text-dg-danger` (et leurs variantes `bg-`/`border-`/`ring-`, modificateurs d'opacité `/15`), `rounded-dg`, `font-dg` ; classes composants `.btn-primary`, `.btn-secondary`, `.input`, `.icon-btn`.

- [ ] **Step 1 : créer `theme.css`**

```css
/* Direction visuelle du plugin : SEUL fichier à modifier pour en changer.
   Les couleurs suivent le thème clair/sombre de Figma (themeColors: true dans main.ts) ;
   les valeurs de repli servent hors Figma (aperçu navigateur). */
@theme inline {
  --color-dg-bg:          var(--figma-color-bg, #2c2c2c);
  --color-dg-raised:      var(--figma-color-bg-secondary, #383838);
  --color-dg-hover:       var(--figma-color-bg-hover, #444444);
  --color-dg-selected:    var(--figma-color-bg-selected, #4a5878);
  --color-dg-text:        var(--figma-color-text, #ffffff);
  --color-dg-text-2:      var(--figma-color-text-secondary, #b3b3b3);
  --color-dg-text-3:      var(--figma-color-text-tertiary, #8a8a8a);
  --color-dg-border:      var(--figma-color-border, #444444);
  --color-dg-accent:      var(--figma-color-bg-brand, #0d99ff);
  --color-dg-accent-text: var(--figma-color-text-brand, #7cc4f8);
  --color-dg-on-accent:   var(--figma-color-text-onbrand, #ffffff);
  --color-dg-success:     var(--figma-color-text-success, #79d297);
  --color-dg-warning:     var(--figma-color-text-warning, #f7d15f);
  --color-dg-danger:      var(--figma-color-text-danger, #fca397);
  --radius-dg: 6px;
  --font-dg: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

- [ ] **Step 2 : réécrire `ui.css`**

```css
@import "tailwindcss";
@import "./theme.css";

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0;
  font-family: var(--font-dg);
  font-size: 11px;
  background: var(--color-dg-bg);
  color: var(--color-dg-text);
  -webkit-font-smoothing: antialiased;
}

@layer components {
  .input {
    @apply w-full bg-dg-bg border border-dg-border rounded-dg px-2 py-1.5 text-[11px] text-dg-text placeholder-dg-text-3 focus:outline-none focus:border-dg-accent transition-colors;
  }
  .btn-primary {
    @apply py-2 px-3 bg-dg-accent hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-dg-on-accent rounded-dg text-[11px] font-medium transition-opacity;
  }
  .btn-secondary {
    @apply py-2 px-3 bg-dg-raised hover:bg-dg-hover border border-dg-border text-dg-text rounded-dg text-[11px] transition-colors disabled:opacity-40;
  }
  .icon-btn {
    @apply w-6 h-6 flex items-center justify-center rounded-dg text-dg-text-2 hover:bg-dg-hover hover:text-dg-text flex-shrink-0 disabled:opacity-30 disabled:cursor-default;
  }
}

/* WCAG 2.4.7 — Focus visible pour tous les éléments interactifs */
button:focus-visible,
[role="button"]:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--color-dg-accent);
  outline-offset: 1px;
}
```

- [ ] **Step 3 : activer le thème Figma** — `plugin/src/main.ts:24` :

```ts
figma.showUI(__html__, { width: 400, height: 600, themeColors: true });
```

- [ ] **Step 4 : vérifier**

Run : `cd plugin && npx tsc --noEmit && npx vitest run`
Expected : aucune erreur ; `Tests  194 passed (194)`.

- [ ] **Step 5 : commit**

```bash
git add plugin/src/theme.css plugin/src/ui.css plugin/src/main.ts
git commit -m "feat(plugin): jetons de thème alignés sur les couleurs Figma"
```

---

### Task 3 : Choix automatique de l'historique (logique pure)

**Files :**
- Create : `plugin/src/ui/historyPick.ts`, `plugin/src/ui/historyPick.test.ts`

**Interfaces :**
- Produces :
  - `pickHistory(assets: Asset[], ids: { currentId: string | null; lastId: string | null }): Asset | null`
  - `ensureHistory(assets: Asset[], ids: { currentId: string | null; lastId: string | null }, create: () => Promise<Asset>): Promise<Asset>`

- [ ] **Step 1 : écrire les tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { pickHistory, ensureHistory } from './historyPick.js';
import type { Asset } from '../store.js';

const a = (id: string): Asset => ({ id, name: id, asset_type: 'ui' });
const none = { currentId: null, lastId: null };

describe('pickHistory', () => {
  it('garde l\'historique ouvert s\'il existe toujours (réponse fraîche après le cache)', () => {
    expect(pickHistory([a('recent'), a('open')], { currentId: 'open', lastId: 'recent' })?.id).toBe('open');
  });
  it('sinon le dernier utilisé dans ce fichier', () => {
    expect(pickHistory([a('recent'), a('last')], { currentId: null, lastId: 'last' })?.id).toBe('last');
  });
  it('dernier utilisé supprimé ou déplacé → le plus récent (premier de la liste)', () => {
    expect(pickHistory([a('recent'), a('old')], { currentId: 'gone', lastId: 'gone-too' })?.id).toBe('recent');
  });
  it('aucun historique → null', () => {
    expect(pickHistory([], none)).toBeNull();
  });
});

describe('ensureHistory', () => {
  it('historique existant → aucune création', async () => {
    const create = vi.fn(async () => a('new'));
    expect((await ensureHistory([a('x')], none, create)).id).toBe('x');
    expect(create).not.toHaveBeenCalled();
  });
  it('liste vide → une seule création', async () => {
    const create = vi.fn(async () => a('new'));
    expect((await ensureHistory([], none, create)).id).toBe('new');
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('création en échec → l\'erreur remonte (l\'appelant affiche « Réessayer »)', async () => {
    await expect(ensureHistory([], none, async () => { throw new Error('réseau'); })).rejects.toThrow('réseau');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `cd plugin && npx vitest run src/ui/historyPick.test.ts`
Expected : FAIL — `Failed to resolve import "./historyPick.js"`.

- [ ] **Step 3 : implémenter**

```ts
// Choix de l'historique affiché, sans écran de sélection : un historique par fichier Figma.
import type { Asset } from '../store.js';

type Ids = { currentId: string | null; lastId: string | null };

/** Historique ouvert s'il existe encore, sinon le dernier utilisé, sinon le plus récent
 *  (la liste du serveur est triée par date de création décroissante). */
export function pickHistory(assets: Asset[], { currentId, lastId }: Ids): Asset | null {
  return assets.find(x => x.id === currentId) ?? assets.find(x => x.id === lastId) ?? assets[0] ?? null;
}

/** Comme pickHistory, mais crée l'historique du fichier s'il n'en a aucun. */
export async function ensureHistory(assets: Asset[], ids: Ids, create: () => Promise<Asset>): Promise<Asset> {
  return pickHistory(assets, ids) ?? await create();
}
```

- [ ] **Step 4 : vérifier le succès**

Run : `cd plugin && npx vitest run src/ui/historyPick.test.ts`
Expected : `Tests  7 passed (7)`.

- [ ] **Step 5 : commit**

```bash
git add plugin/src/ui/historyPick.ts plugin/src/ui/historyPick.test.ts
git commit -m "feat(plugin): choix automatique de l'historique du fichier"
```

---

### Task 4 : Brancher le choix automatique, masquer assets et branches

**Files :**
- Create : `plugin/src/ui/history.ts`, `plugin/src/ui/components/Header.tsx`, `plugin/src/ui/components/HomeMenu.tsx`
- Modify : `plugin/src/types.ts` (`FILE_INFO`, nouveau `REMEMBER_ASSET`), `plugin/src/main.ts` (envoi de `FILE_INFO`, handler `REMEMBER_ASSET`), `plugin/src/store.ts:17`, `plugin/src/store.test.ts:34-39`, `plugin/src/ui.tsx` (`App`), `plugin/src/ui/screens/Home.tsx`, `plugin/src/ui/screens/Checkpoint.tsx`
- Delete : `plugin/src/ui/screens/Assets.tsx`

**Interfaces :**
- Consumes : `ensureHistory`, `pickHistory` (tâche 3) ; `session`, `api`, `send` (tâche 1) ; jetons (tâche 2).
- Produces :
  - `openHistory(apiKey: string, assets: Asset[], currentId: string | null): Promise<void>` et `rememberHistory(a: Asset): void` (`ui/history.ts`)
  - `Header({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ComponentChildren })`, `PlanBadge({ plan, onUpgrade }: { plan: Plan; onUpgrade: () => void })` (`ui/components/Header.tsx`)
  - `HomeMenu()` (`ui/components/HomeMenu.tsx`)
  - Messages : `MainToUI` `{ type: 'FILE_INFO'; fileKey: string; fileName: string; lastAssetId: string | null }` ; `UIToMain` `{ type: 'REMEMBER_ASSET'; fileKey: string; assetId: string }`.

- [ ] **Step 1 : adapter le test du store (échec attendu)** — `plugin/src/store.test.ts`, remplacer `'assets'` par `'home'` aux lignes 34-35 et retirer `'assets'` du tableau ligne 39 :

```ts
    getState().setScreen('home')
    expect(getState().screen).toBe('home')
```
```ts
    const screens = ['home', 'diff', 'checkpoint', 'loading'] as const
```

Puis `plugin/src/store.ts:17` :

```ts
export type Screen = 'loading' | 'home' | 'frameHistory' | 'checkpoint' | 'diff'
```

Run : `cd plugin && npx tsc --noEmit`
Expected : erreurs dans `ui.tsx` et `ui/screens/Assets.tsx`/`Home.tsx` sur `'assets'` — elles disparaissent aux étapes suivantes.

- [ ] **Step 2 : messages** — `plugin/src/types.ts` :

```ts
  | { type: 'FILE_INFO'; fileKey: string; fileName: string; lastAssetId: string | null }
```
et dans `UIToMain` :
```ts
  | { type: 'REMEMBER_ASSET'; fileKey: string; assetId: string } // dernier historique ouvert dans ce fichier
```

`plugin/src/main.ts` — les deux envois de `FILE_INFO` (démarrage et `RETRY_INIT`) :

```ts
  const lastAssetId = (await figma.clientStorage.getAsync('dg_last_asset_' + fileKey)) as string | undefined;
  send({ type: 'FILE_INFO', fileKey, fileName: figma.root.name, lastAssetId: lastAssetId ?? null });
```
```ts
    case 'RETRY_INIT': {
      const key = figma.root.getPluginData(FILE_ID_KEY);
      if (isValidFileId(key)) {
        const last = (await figma.clientStorage.getAsync('dg_last_asset_' + key)) as string | undefined;
        send({ type: 'FILE_INFO', fileKey: key, fileName: figma.root.name, lastAssetId: last ?? null });
      }
      break;
    }
    case 'REMEMBER_ASSET':
      await figma.clientStorage.setAsync('dg_last_asset_' + msg.fileKey, msg.assetId);
      break;
```

- [ ] **Step 3 : `ui/history.ts`**

```ts
// Ouverture de l'historique du fichier (remplace l'écran « Choisir un asset »).
import { appStore } from '../store.js';
import type { Asset } from '../store.js';
import { api, send, session } from './api.js';
import { ensureHistory } from './historyPick.js';

export function rememberHistory(a: Asset) {
  session.lastAssetId = a.id;
  if (session.fileKey) send({ type: 'REMEMBER_ASSET', fileKey: session.fileKey, assetId: a.id });
}

/** Ouvre l'historique courant s'il existe, sinon le dernier utilisé ou le plus récent, sinon
 *  le crée au nom du fichier. Échec → écran de chargement avec « Réessayer » (RETRY_INIT). */
export async function openHistory(apiKey: string, assets: Asset[], currentId: string | null) {
  const { setAsset, setAssets, setScreen, setInitErr } = appStore.getState();
  try {
    const asset = await ensureHistory(assets, { currentId, lastId: session.lastAssetId }, async () => {
      const { asset: created } = await api<{ asset: Asset }>(apiKey, '/api/assets', {
        method: 'POST', body: JSON.stringify({ name: session.fileName || 'Historique', asset_type: 'ui' }),
      });
      setAssets([created]);
      return created;
    });
    rememberHistory(asset);
    if (asset.id !== appStore.getState().asset?.id) setAsset(asset);
    if (appStore.getState().screen === 'loading') setScreen('home');
  } catch {
    setScreen('loading');
    setInitErr('Impossible de créer l\'historique de ce fichier.');
  }
}
```

- [ ] **Step 4 : `App` (`ui.tsx`)** — dans le handler :

`FILE_INFO`, en tête (avant tout `await`) :
```ts
          session.fileName = msg.fileName;
          session.fileKey = msg.fileKey;
          session.lastAssetId = msg.lastAssetId;
```
puis remplacer le bloc `const cur = appStore.getState().screen; if (cur === 'loading' || cur === 'assets') setScreen('assets');` par :
```ts
            // Réponse fraîche : l'historique déjà ouvert (depuis le cache) reste ouvert s'il existe.
            const open = appStore.getState().asset;
            if (appStore.getState().screen === 'loading' || !open || !data.assets.some(a => a.id === open.id)) {
              await openHistory(data.api_key, data.assets, open?.id ?? null);
            }
```
(et supprimer la ligne `currentFileName = msg.fileName;` devenue `session.fileName` plus haut).

`CACHED_STATE`, remplacer `setScreen('assets');` par :
```ts
            const cachedPick = pickHistory(msg.assets, { currentId: null, lastId: session.lastAssetId });
            if (cachedPick) { appStore.getState().setAsset(cachedPick); setScreen('home'); }
```

`SPLIT_READY`, après `setSplitOffer(null);` :
```ts
            session.fileKey = msg.fileKey;
            await openHistory(data.api_key, data.assets, appStore.getState().asset?.id ?? null);
```

Routage : supprimer `if (screen === 'assets') return <AssetsScreen />;` et l'import d'`AssetsScreen` ; supprimer les cas `BRANCH_CREATED` / `BRANCH_SWITCHED` (ils ne font rien) ; importer `openHistory` de `./ui/history.js` et `pickHistory` de `./ui/historyPick.js`. Supprimer `plugin/src/ui/screens/Assets.tsx` (`git rm`).

- [ ] **Step 5 : `Header.tsx`**

```tsx
import type { ComponentChildren } from 'preact';
import type { Plan } from '../../store.js';

export function Header({ title, subtitle, onBack, right }: {
  title: string; subtitle?: string; onBack?: () => void; right?: ComponentChildren;
}) {
  return (
    <div class="flex items-center gap-2 px-3 h-10 border-b border-dg-border flex-shrink-0">
      {onBack && <button aria-label="Retour" class="icon-btn" onClick={onBack}>←</button>}
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-semibold truncate">{title}</p>
        {subtitle && <p class="text-[10px] text-dg-text-3 truncate">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// Team est abandonné (arbitrage 2026-09-07) : tout plan payant s'affiche « Pro ».
export function PlanBadge({ plan, onUpgrade }: { plan: Plan; onUpgrade: () => void }) {
  const pro = plan !== 'free';
  return (
    <button
      class={`px-1.5 py-0.5 rounded-dg text-[10px] font-medium flex-shrink-0 ${pro ? 'bg-dg-accent/15 text-dg-accent-text cursor-default' : 'bg-dg-hover text-dg-text-2'}`}
      aria-label={pro ? 'Plan Pro — checkpoints illimités.' : 'Plan Free — 10 checkpoints max. Cliquer pour passer à Pro.'}
      onClick={() => { if (!pro) onUpgrade(); }}
    >{pro ? 'Pro' : 'Free'}</button>
  );
}
```

- [ ] **Step 6 : `HomeMenu.tsx`** (lien de compte, sélecteur d'historique si plusieurs, séparation déplacée depuis l'ancien écran d'asset)

```tsx
import { useState } from 'preact/hooks';
import { useAppStore } from '../../useAppStore.js';
import { appStore } from '../../store.js';
import { send } from '../api.js';
import { rememberHistory } from '../history.js';
import { AccountLink } from './AccountLink.js';

function SplitOffer() {
  const splitOffer = useAppStore(s => s.splitOffer)!;
  return (
    <div role="status" class="p-2 bg-dg-warning/10 border border-dg-warning/30 rounded-dg flex flex-col gap-1.5">
      <p class="text-[11px] text-dg-warning">
        Ce projet est partagé avec d'autres fichiers : {splitOffer.elsewhere.length} élément(s) suivi(s) ne sont pas dans ce fichier.
      </p>
      <p class="text-[10px] text-dg-text-2">
        Séparer ce fichier lui donne son propre historique, avec ses {splitOffer.here.length} élément(s). Les autres restent avec les autres fichiers.
      </p>
      <p class="text-[10px] text-dg-text-3">
        Un élément dont la page a été supprimée est aussi introuvable : s'ils appartiennent bien à ce fichier, ignorez.
      </p>
      <div class="flex gap-2">
        <button class="btn-secondary py-1" onClick={() => send({ type: 'SPLIT_BEGIN' })}>Séparer ce fichier</button>
        <button class="text-[11px] text-dg-text-2 hover:text-dg-text px-2"
          onClick={() => { send({ type: 'SPLIT_DISMISS', assetIds: splitOffer.elsewhere }); appStore.getState().setSplitOffer(null); }}>
          Ignorer
        </button>
      </div>
    </div>
  );
}

export function HomeMenu() {
  const assets     = useAppStore(s => s.assets);
  const asset      = useAppStore(s => s.asset);
  const setAsset   = useAppStore(s => s.setAsset);
  const splitOffer = useAppStore(s => s.splitOffer);
  const [open, setOpen] = useState(false);
  return (
    <div class="relative">
      <button aria-label="Menu" aria-expanded={open} class="icon-btn relative" onClick={() => setOpen(o => !o)}>
        ⋯{splitOffer && <span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-dg-warning" />}
      </button>
      {open && (
        <div class="absolute right-0 top-full mt-1 z-50 w-64 p-3 bg-dg-raised border border-dg-border rounded-dg shadow-lg flex flex-col gap-3">
          <AccountLink />
          {assets.length > 1 && (
            <label class="flex flex-col gap-1 text-[11px] text-dg-text-2">
              Historique
              <select class="input" value={asset?.id}
                onChange={e => {
                  const next = assets.find(x => x.id === (e.target as HTMLSelectElement).value);
                  if (next) { rememberHistory(next); setAsset(next); setOpen(false); }
                }}>
                {assets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
          )}
          {splitOffer && <SplitOffer />}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7 : `Home.tsx` et `Checkpoint.tsx`** — retirer branches et asset :
  - `Home.tsx` : supprimer `setBranch`, les états `branches`/`newBranch`, `setBranches(...)` (2 endroits), toute la rangée d'onglets de branches (div `border-b` contenant `branches.map` et l'input `+ branche`) ; remplacer le bouton d'en-tête `onClick={() => setScreen('assets')}` (logo + nom) par `<Header title={asset.name} right={<><PlanBadge plan={plan} onUpgrade={onUpgrade} /><HomeMenu /></>} />` et supprimer l'ancien badge de plan ; le texte vide devient `Aucun checkpoint pour l'instant`.
  - `Checkpoint.tsx` : supprimer l'état `branchName` et le bloc `<label htmlFor="cp-branch">…<input id="cp-branch" …/>` ; `branch_name: branchName.trim() || 'main'` → `branch_name: branch` ; `<p class="text-xs text-gray-500 font-mono">{branchName}</p>` supprimé ; dépendance `branchName` → `branch` dans le `useCallback`.

- [ ] **Step 8 : vérifier**

Run : `cd plugin && npx tsc --noEmit && npx vitest run`
Expected : aucune erreur ; `Tests  201 passed (201)`.

- [ ] **Step 9 : commit**

```bash
git rm plugin/src/ui/screens/Assets.tsx
git add plugin/src/types.ts plugin/src/main.ts plugin/src/store.ts plugin/src/store.test.ts plugin/src/ui.tsx plugin/src/ui/history.ts plugin/src/ui/components/Header.tsx plugin/src/ui/components/HomeMenu.tsx plugin/src/ui/screens/Home.tsx plugin/src/ui/screens/Checkpoint.tsx
git commit -m "feat(plugin): historique choisi automatiquement, assets et branches masqués"
```

---

### Task 5 : Accueil et historique de frame redessinés

**Files :**
- Create : `plugin/src/ui/components/SummaryCard.tsx`
- Modify : `plugin/src/ui/screens/Home.tsx` (réécrit), `plugin/src/ui/components/FramesPanel.tsx` (réécrit), `plugin/src/ui/components/VersionRow.tsx` (réécrit), `plugin/src/ui/screens/FrameHistory.tsx`

**Interfaces :**
- Consumes : `Header`, `PlanBadge`, `HomeMenu` (tâche 4) ; `clearDiffCache` (tâche 1).
- Produces : `SummaryCard({ version, onOpen }: { version: Version; onOpen: () => void })` ; `FramesPanel({ versions, onOpen }: { versions: Version[]; onOpen: (f: FrameEntry) => void })` (props désormais obligatoires) ; `VersionRow({ v, onClick }: { v: Version; onClick?: () => void })`.

- [ ] **Step 1 : `SummaryCard.tsx`**

```tsx
import type { Version } from '../../store.js';
import { timeAgo } from '../../utils.js';

// Le résumé IA est ce que le produit vend : il ouvre l'accueil.
export function SummaryCard({ version, onOpen }: { version: Version; onOpen: () => void }) {
  return (
    <button onClick={onOpen}
      class="mx-3 mt-3 p-3 text-left rounded-dg bg-dg-raised border border-dg-border hover:border-dg-accent transition-colors flex-shrink-0"
      aria-label={`Dernier checkpoint, version ${version.version_number}`}>
      <p class="text-[10px] text-dg-text-3">
        Dernier checkpoint · v{version.version_number} · {timeAgo(version.created_at)}{version.author_name ? ` · ${version.author_name}` : ''}
      </p>
      <p class="text-[12px] leading-snug mt-1 line-clamp-3">{version.ai_summary ?? 'Pas encore de résumé.'}</p>
    </button>
  );
}
```

- [ ] **Step 2 : `VersionRow.tsx`**

```tsx
import type { Version } from '../../store.js';
import { timeAgo } from '../../utils.js';

// Une version de la timeline : le résumé IA d'abord, puis numéro, auteur, date, statut.
export function VersionRow({ v, onClick }: { v: Version; onClick?: () => void }) {
  const dot = { approved: 'bg-dg-success', review: 'bg-dg-warning', draft: 'bg-dg-text-3' }[v.status];
  const inner = (
    <>
      <span class={`relative z-10 mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-dg-bg ${dot}`} />
      <div class="flex-1 min-w-0">
        <p class="text-[12px] leading-snug line-clamp-2">{v.ai_summary ?? `Version ${v.version_number}`}</p>
        <p class="text-[10px] text-dg-text-3 mt-0.5 flex items-center gap-1">
          <span class="font-mono">v{v.version_number}</span>
          {v.author_name && <span>· {v.author_name}</span>}
          <span>· {timeAgo(v.created_at)}</span>
          {v.status === 'approved' && <span title="Gold : version validée et approuvée — référence de qualité pour l'équipe" class="ml-auto text-dg-success cursor-help">✦ Gold</span>}
          {v.status === 'review' && <span class="ml-auto text-dg-warning">Review</span>}
        </p>
      </div>
    </>
  );
  if (onClick) return (
    <button
      class="w-full text-left flex items-start gap-2.5 py-2 px-1 -mx-1 rounded-dg hover:bg-dg-hover transition-colors"
      onClick={onClick}
      aria-label={`Version ${v.version_number}${v.author_name ? ` par ${v.author_name}` : ''}${v.ai_summary ? ` — ${v.ai_summary.slice(0, 80)}` : ''}`}
    >
      {inner}
    </button>
  );
  return <div class="flex items-start gap-2.5 py-2">{inner}</div>;
}
```

- [ ] **Step 3 : `FramesPanel.tsx`** (façon panneau Calques ; garde-fous de durée conservés)

```tsx
import { useState, useEffect } from 'preact/hooks';
import type { Version } from '../../store.js';
import { frameStats } from '../../frameNav.js';
import { estimateMs, WARN_MS, type FrameEntry } from '../../trackedFrames.js';
import { timeAgo } from '../../utils.js';
import { send } from '../api.js';

function FrameIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" class="flex-shrink-0 text-dg-text-3">
      <path d="M3.5 1v10M8.5 1v10M1 3.5h10M1 8.5h10" stroke="currentColor" fill="none" />
    </svg>
  );
}

// Liste TOUTES les frames de la page : l'utilisateur doit voir ce qu'il ne suit pas, sinon
// l'omission redevient silencieuse. L'estimation du coût est affichée en continu — c'est le
// garde-fou qui l'empêche de reconstruire sans s'en rendre compte le mur mesuré au spike
// (93,8 s pour les 331 frames d'une page réelle). Une frame avec historique s'ouvre au clic.
export function FramesPanel({ versions, onOpen }: { versions: Version[]; onOpen: (f: FrameEntry) => void }) {
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
      <p class="text-[11px] text-dg-warning p-3">
        La page « {pageName} » est une page technique Design Guardian : elle n'est pas suivie.
      </p>
    );
  }

  return (
    <div class="flex flex-col py-1">
      <div class="flex items-baseline justify-between px-3 py-1.5">
        <span class="text-[11px] text-dg-text-2">{tracked.length} / {frames.length} frames suivies</span>
        <span class={`text-[10px] ${ms >= WARN_MS ? 'text-dg-warning' : 'text-dg-text-3'}`}>
          {tracked.length === 0 ? 'coche les frames à suivre' : `~${nodes} calques · ~${(ms / 1000).toFixed(1)} s`}
        </span>
      </div>

      {ms >= WARN_MS && (
        <p role="alert" class="text-[10px] text-dg-warning px-3 pb-1.5">
          Périmètre large : la capture gèlera Figma pendant l'extraction. Retire des frames pour l'accélérer.
        </p>
      )}

      {frames.length > 8 && (
        <div class="px-3 pb-1.5">
          <input type="search" value={q} placeholder="Filtrer les frames…" class="input py-1"
            onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </div>
      )}

      {shown.map(f => {
        const stats = frameStats(versions, f.key);
        const hasHistory = stats.versions > 0;
        return (
          <label key={f.id} class="flex items-center gap-2 h-7 px-3 text-[11px] hover:bg-dg-hover cursor-pointer">
            <input type="checkbox" class="accent-dg-accent" checked={f.tracked}
              aria-label={`Suivre ${f.name}`}
              onChange={() => send({ type: 'SET_TRACKED', nodeId: f.id, tracked: !f.tracked })} />
            <FrameIcon />
            {hasHistory ? (
              <button type="button" class="flex-1 min-w-0 flex items-baseline gap-2 text-left"
                onClick={(e) => { e.preventDefault(); onOpen(f); }}>
                <span class="flex-1 truncate">{f.name}</span>
                <span class="text-[10px] text-dg-text-3 whitespace-nowrap">
                  {stats.versions} v.{stats.lastAt ? ` · ${timeAgo(stats.lastAt)}` : ''}
                </span>
              </button>
            ) : (
              <span class={`flex-1 truncate ${f.tracked ? '' : 'text-dg-text-3'}`}>{f.name}</span>
            )}
          </label>
        );
      })}
      {shown.length === 0 && <p class="text-[11px] text-dg-text-3 px-3 py-1">Aucune frame ne correspond.</p>}
    </div>
  );
}
```

- [ ] **Step 4 : `Home.tsx` (réécrit)**

```tsx
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { MainToUI } from '../../types.js';
import type { Version } from '../../store.js';
import { useAppStore } from '../../useAppStore.js';
import { frameHistory } from '../../frameNav.js';
import type { FrameEntry } from '../../trackedFrames.js';
import { api, send } from '../api.js';
import { clearDiffCache } from '../diff/DiffScreen.js';
import { Header, PlanBadge } from '../components/Header.js';
import { HomeMenu } from '../components/HomeMenu.js';
import { SummaryCard } from '../components/SummaryCard.js';
import { FramesPanel } from '../components/FramesPanel.js';
import { VersionRow } from '../components/VersionRow.js';
import { Spinner } from '../components/common.js';

export function HomeScreen({ onUpgrade }: { onUpgrade: () => void }) {
  const apiKey         = useAppStore(s => s.apiKey)!;
  const asset          = useAppStore(s => s.asset)!;
  const plan           = useAppStore(s => s.plan);
  const branch         = useAppStore(s => s.branch);
  const setScreen      = useAppStore(s => s.setScreen);
  const setDiffVersion = useAppStore(s => s.setDiffVersion);
  const setSiblings    = useAppStore(s => s.setSiblings);
  const setFrame       = useAppStore(s => s.setFrame);

  const [versions, setVersions] = useState<Version[]>([]);
  const [tab,      setTab]      = useState<'frames' | 'versions'>('frames');
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState<string | null>(null);
  const [pageName, setPageName] = useState('');
  // Garde anti-course « le frais gagne » : une réponse VERSION_CACHE (stale) arrivée
  // après le fetch frais ne doit pas écraser l'affichage à jour.
  const freshLoaded = useRef(false);

  useEffect(() => {
    setLoading(true);
    freshLoaded.current = false;
    // Rechargement de la timeline : le cache diff peut contenir des entrées d'un autre historique.
    clearDiffCache();
    send({ type: 'REQUEST_VERSION_CACHE', assetId: asset.id });
    api<{ versions: Version[]; branches: string[] }>(apiKey, `/api/versions/tree?asset_id=${asset.id}`)
      .then(d => {
        freshLoaded.current = true;
        setVersions(d.versions ?? []);
        send({ type: 'PERSIST_VERSION_CACHE', assetId: asset.id, versions: d.versions ?? [], branches: d.branches ?? ['main'] });
      })
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [apiKey, asset.id]);

  // Cache stale-while-revalidate (timeline instantanée) + nom de la page courante pour l'en-tête.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data.pluginMessage as MainToUI;
      if (!msg) return;
      if (msg.type === 'FRAMES_LIST') { setPageName(msg.pageName); return; }
      if (msg.type !== 'VERSION_CACHE' || msg.assetId !== asset.id || freshLoaded.current) return;
      setVersions(msg.versions);
      setLoading(false);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [asset.id]);

  const visible = versions.filter(v => v.branch_name === branch);
  const latest  = visible.length > 0 ? visible[visible.length - 1] : null;

  const openDiff = useCallback((v: Version) => { setFrame(null); setSiblings(visible); setDiffVersion(v); setScreen('diff'); }, [visible]);
  // Page-centric : clic sur une frame → son historique (versions où elle est apparue ou a changé).
  const openFrame = useCallback((f: FrameEntry) => {
    setFrame({ key: f.key, name: f.name });
    setSiblings(frameHistory(visible, f.key));
    setScreen('frameHistory');
  }, [visible]);

  const limitReached = plan === 'free' && versions.length >= 10;

  return (
    <div class="flex flex-col h-screen bg-dg-bg text-dg-text">
      <Header title={pageName || asset.name} subtitle={pageName ? asset.name : undefined}
        right={<><PlanBadge plan={plan} onUpgrade={onUpgrade} /><HomeMenu /></>} />

      {latest && <SummaryCard version={latest} onOpen={() => openDiff(latest)} />}

      {visible.length > 0 && (
        <div role="tablist" class="flex gap-1 px-3 pt-2 flex-shrink-0">
          {(['frames', 'versions'] as const).map(t => (
            <button key={t} role="tab" aria-selected={tab === t}
              class={`px-2 py-1 rounded-dg text-[11px] ${tab === t ? 'bg-dg-selected text-dg-text' : 'text-dg-text-2 hover:bg-dg-hover'}`}
              onClick={() => setTab(t)}>{t === 'frames' ? 'Frames' : 'Toutes les versions'}</button>
          ))}
        </div>
      )}

      <div class="flex-1 overflow-y-auto">
        {err && <p role="alert" class="text-dg-danger text-[11px] p-3">{err}</p>}
        {tab === 'frames' || visible.length === 0
          ? <FramesPanel versions={visible} onOpen={openFrame} />
          : loading
            ? <Spinner />
            : (
              <div class="relative px-3 py-2">
                <div class="absolute left-[15.5px] top-0 bottom-0 w-px bg-dg-border" />
                {[...visible].reverse().map(v => <VersionRow key={v.id} v={v} onClick={() => openDiff(v)} />)}
              </div>
            )}
      </div>

      <div class="p-3 border-t border-dg-border flex flex-col gap-2 flex-shrink-0">
        {limitReached && (
          <p class="text-[11px] text-dg-warning text-center">
            Limite Free atteinte (10 checkpoints). <button class="underline" onClick={onUpgrade}>Passer à Pro</button>
          </p>
        )}
        <button class="btn-primary w-full" onClick={() => send({ type: 'REQUEST_SNAPSHOT' })} disabled={limitReached}>
          Capturer un checkpoint
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5 : `FrameHistory.tsx`** — remplacer le rendu :

```tsx
  return (
    <div class="flex flex-col h-screen bg-dg-bg text-dg-text">
      <Header title={frame.name} subtitle="Historique de la frame" onBack={() => { setFrame(null); setScreen('home'); }} />
      <div class="flex-1 overflow-y-auto">
        {history.length === 0
          ? <p class="text-dg-text-3 text-[11px] p-3">Aucune version pour cette frame.</p>
          : (
            <div class="relative px-3 py-2">
              <div class="absolute left-[15.5px] top-0 bottom-0 w-px bg-dg-border" />
              {[...history].reverse().map(v => (
                <VersionRow key={v.id} v={v} onClick={() => { setDiffVersion(v); setScreen('diff'); }} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
```
avec `import { Header } from '../components/Header.js';` (et suppression de l'import de `Topbar`).

- [ ] **Step 6 : vérifier**

Run : `cd plugin && npx tsc --noEmit && npx vitest run`
Expected : aucune erreur ; `Tests  201 passed (201)`.

- [ ] **Step 7 : commit**

```bash
git add plugin/src/ui/components/SummaryCard.tsx plugin/src/ui/components/VersionRow.tsx plugin/src/ui/components/FramesPanel.tsx plugin/src/ui/screens/Home.tsx plugin/src/ui/screens/FrameHistory.tsx
git commit -m "feat(plugin): accueil façon calques Figma, résumé IA en vedette"
```

---

### Task 6 : Chargement, capture, offre et composants communs redessinés

**Files :**
- Modify : `plugin/src/ui/screens/Loading.tsx`, `plugin/src/ui/screens/Checkpoint.tsx`, `plugin/src/ui/screens/Upgrade.tsx`, `plugin/src/ui/components/common.tsx`, `plugin/src/ui/components/AccountLink.tsx`

**Interfaces :**
- Consumes : `Header` (tâche 4).
- Produces : `common.tsx` exporte `Spinner` seul (`Logo` et `Topbar` supprimés, plus utilisés après les tâches 5 et 7 — `DiffScreen` n'en dépend pas).

- [ ] **Step 1 : `common.tsx`**

```tsx
export function Spinner({ full = false }: { full?: boolean }) {
  const inner = <div role="status" aria-label="Chargement…" class="w-4 h-4 border-2 border-dg-accent border-t-transparent rounded-full animate-spin" />;
  return full
    ? <div class="flex items-center justify-center h-screen bg-dg-bg">{inner}</div>
    : <div class="flex justify-center py-6">{inner}</div>;
}
```

- [ ] **Step 2 : `Loading.tsx`** — rendu :

```tsx
  return (
    <div role="status" aria-label={initErr ? 'Erreur de connexion' : 'Connexion au projet…'} class="flex flex-col items-center justify-center h-screen bg-dg-bg text-dg-text gap-3">
      {!initErr && <Spinner />}
      {initErr ? (
        <>
          <p role="alert" class="text-dg-danger text-[11px] text-center px-6">{initErr}</p>
          <button class="btn-secondary" onClick={() => { setInitErr(null); send({ type: 'RETRY_INIT' }); }}>Réessayer</button>
        </>
      ) : (
        <p class="text-dg-text-3 text-[11px]" aria-hidden="true">Ouverture de l'historique…</p>
      )}
    </div>
  );
```

- [ ] **Step 3 : `AccountLink.tsx`** — remplacer les rendus de fin :

```tsx
  if (state.phase === 'linked')   return <p class="text-[11px] text-dg-success">✓ Compte lié</p>;
  if (state.phase === 'awaiting') return <p class="text-[11px] text-dg-text-2">En attente d'approbation dans le navigateur…</p>;
  if (state.phase === 'expired')  return <button class="btn-secondary" onClick={() => dispatch({ type: 'RESET' })}>Code expiré — réessayer</button>;
  if (state.phase === 'error')    return <button class="btn-secondary" onClick={start}>Erreur — réessayer</button>;
  return (
    <button class="btn-secondary" onClick={start} disabled={state.phase === 'starting' || !author}>
      {state.phase === 'starting' ? 'Connexion…' : 'Lier mon compte'}
    </button>
  );
```

- [ ] **Step 4 : `Checkpoint.tsx`** — les trois rendus :

```tsx
  if (saved) return (
    <div class="flex flex-col h-screen bg-dg-bg text-dg-text p-4">
      <div class="flex-1 flex flex-col justify-center gap-3">
        <p class="text-dg-success text-[12px] font-semibold">✦ Checkpoint enregistré</p>
        <div class="p-3 bg-dg-raised rounded-dg border border-dg-border flex flex-col gap-1.5">
          {patchNote ? (
            <p class="text-[12px] leading-snug">{patchNote}</p>
          ) : saved.changes <= 0 ? (
            <p class="text-[12px] leading-snug">Aucune modification détectée.</p>
          ) : patchState === 'pending' ? (
            <p class="text-[12px] text-dg-text-2 flex items-center gap-2"><Spinner /> Résumé en cours…</p>
          ) : (
            <div class="flex flex-col gap-2">
              <p class="text-[12px] text-dg-text-2">Résumé indisponible.</p>
              <button class="btn-secondary" onClick={regenerate} disabled={regenerating}>
                {regenerating ? 'Régénération…' : 'Régénérer'}
              </button>
            </div>
          )}
          {saved.changes > 0 && <p class="text-[10px] text-dg-accent-text">{saved.changes} modification(s)</p>}
        </div>
      </div>
      <button class="btn-secondary w-full" onClick={() => setScreen('home')}>← Retour à l'accueil</button>
    </div>
  );

  // Feedback franc pendant la capture : un écran plein plutôt qu'un simple libellé de bouton,
  // pour que le clic ait un effet visible immédiat (la latence perçue chutait sans ça).
  if (loading) return (
    <div class="flex flex-col h-screen bg-dg-bg text-dg-text items-center justify-center gap-3">
      <Spinner />
      <p class="text-[12px]">Capture en cours…</p>
      <p class="text-[11px] text-dg-text-3">{snapshot.figmaNodeName}</p>
    </div>
  );

  return (
    <div class="flex flex-col h-screen bg-dg-bg text-dg-text">
      <Header title="Nouveau checkpoint" onBack={() => setScreen('home')} />
      <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <div class="p-3 bg-dg-raised rounded-dg border border-dg-border">
          <p class="text-[10px] text-dg-text-3 mb-0.5">Capturé</p>
          <p class="text-[12px] font-medium">{snapshot.figmaNodeName}</p>
        </div>
        {err && <p role="alert" class="text-dg-danger text-[11px]">{err}</p>}
      </div>
      <div class="p-3 border-t border-dg-border">
        <button class="btn-primary w-full" onClick={save}>Enregistrer le checkpoint</button>
      </div>
    </div>
  );
```
Imports : `Header` de `../components/Header.js`, `Spinner` de `../components/common.js` (retirer `Topbar`).

- [ ] **Step 5 : `Upgrade.tsx`** (Free et Pro uniquement)

```tsx
import { AccountLink } from '../components/AccountLink.js';
import { Header } from '../components/Header.js';

const PLANS = [
  { plan: 'Free', price: '0 €',     features: ['10 checkpoints', 'Diff géométrique', 'Résumés IA'] },
  { plan: 'Pro',  price: '12 €/mois', features: ['Checkpoints illimités', 'Diff géométrique 0,01 px', 'Export Delta JSON'] },
];

export function UpgradeScreen({ onBack }: { onBack: () => void }) {
  return (
    <div class="flex flex-col h-screen bg-dg-bg text-dg-text">
      <Header title="Passer à Pro" onBack={onBack} />
      <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {PLANS.map(({ plan, price, features }) => (
          <div key={plan} class={`p-3 bg-dg-raised border rounded-dg flex flex-col gap-1.5 ${plan === 'Pro' ? 'border-dg-accent' : 'border-dg-border'}`}>
            <div class="flex items-center justify-between">
              <span class="text-[12px] font-semibold">{plan}</span>
              <span class="text-[12px] text-dg-accent-text">{price}</span>
            </div>
            {features.map(f => <p key={f} class="text-[11px] text-dg-text-2">· {f}</p>)}
          </div>
        ))}
        <p class="text-[11px] text-dg-text-2 mt-2">L'abonnement est porté par votre compte : liez-le pour débloquer Pro dans ce plugin.</p>
        <AccountLink />
      </div>
      <p class="text-[10px] text-dg-text-3 text-center p-3">Contact : design-guardian@proton.me</p>
    </div>
  );
}
```

- [ ] **Step 6 : vérifier**

Run : `cd plugin && npx tsc --noEmit && npx vitest run`
Expected : aucune erreur ; `Tests  201 passed (201)`.

- [ ] **Step 7 : commit**

```bash
git add plugin/src/ui/components/common.tsx plugin/src/ui/components/AccountLink.tsx plugin/src/ui/screens/Loading.tsx plugin/src/ui/screens/Checkpoint.tsx plugin/src/ui/screens/Upgrade.tsx
git commit -m "feat(plugin): capture, chargement et offre redessinés (Free et Pro)"
```

---

### Task 7 : Diff redessiné + garde anti-couleurs en dur

**Files :**
- Create : `plugin/src/ui/noHardcodedColors.test.ts`
- Modify : `plugin/src/ui/diff/DiffScreen.tsx`, `plugin/src/ui/diff/DiffCanvas.tsx`, `plugin/src/ui/diff/NodeDetail.tsx`, `plugin/src/ui/diff/DiffChips.tsx`, et tout fichier que la garde signale

**Interfaces :**
- Consumes : jetons (tâche 2).
- Produces : aucune nouvelle interface.

- [ ] **Step 1 : écrire la garde**

```ts
// La direction visuelle tient dans theme.css : aucune couleur Tailwind en dur dans l'UI,
// sinon un thème (clair/sombre Figma, ou autre direction) casse la lisibilité.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = /\b(?:bg|text|border|ring|placeholder|from|to|accent)-(?:gray|purple|green|amber|red|blue|white|black)\b/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('UI : couleurs via les jetons dg-*', () => {
  it('aucune couleur Tailwind en dur dans ui.tsx et ui/**', () => {
    const files = [join(here, '..', 'ui.tsx'), ...tsxFiles(here)];
    const offenders = files.flatMap(f => readFileSync(f, 'utf8').split('\n')
      .map((line, i) => (FORBIDDEN.test(line) ? `${f.slice(here.length - 2)}:${i + 1}: ${line.trim()}` : null))
      .filter((x): x is string => x !== null));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `cd plugin && npx vitest run src/ui/noHardcodedColors.test.ts`
Expected : FAIL — la liste `offenders` contient les lignes de `ui/diff/*.tsx` (`bg-gray-950`, `text-purple-400`…).

- [ ] **Step 3 : remplacer les couleurs dans `ui/diff/*`** selon cette table (appliquer aussi aux variantes `hover:`, `/NN`, `ring-`) :

| Avant | Après |
|--|--|
| `bg-gray-950` | `bg-dg-bg` |
| `bg-gray-900` (et `/80`, `/50`) | `bg-dg-raised` |
| `bg-gray-800` (et `/40`, `/80`), `bg-gray-700`, `bg-gray-600` | `bg-dg-hover` |
| `border-gray-800`, `border-gray-700`, `border-gray-600` | `border-dg-border` |
| `text-white`, `text-gray-100`, `text-gray-200` | `text-dg-text` |
| `text-gray-300`, `text-gray-400` | `text-dg-text-2` |
| `text-gray-500`, `text-gray-600`, `text-gray-700` | `text-dg-text-3` |
| `purple-*` (fond, texte, bordure) | `dg-accent` (fond/bordure), `dg-accent-text` (texte), `text-dg-on-accent` sur fond `bg-dg-accent` |
| `green-*` | `dg-success` |
| `amber-*` | `dg-warning` |
| `red-*` | `dg-danger` |
| `white/NN` (`ring-white/70`, `bg-white/5`) | `dg-text/NN` |
| `border-gray-500/50` (`TONE_CLASS.derived`) | `border-dg-text-3/50` |

Ajustements précis :
- `DiffScreen.tsx`, en-tête : supprimer `<span class="text-gray-500 font-normal"> · {version.branch_name}</span>` (branche masquée) ; boutons `←`, `◀`, `▶` → `class="icon-btn"` ; bouton « ↩ Restore » → `class="btn-primary py-1 px-2"` ; bouton « ↩ Checkpoint » → `class="btn-secondary py-1 px-2"` ; en-tête `px-3 py-2`.
- `DiffScreen.tsx`, résumé IA (`version.ai_summary`) : `<div class="px-3 py-2 border-b border-dg-border flex-shrink-0 bg-dg-raised"><p class="text-[12px] leading-snug">{version.ai_summary}</p></div>`.
- `DiffCanvas.tsx`, `TONE_CLASS` : `modified: 'border-dg-accent'`, `added: 'border-dg-success'`, `removed: 'border-dg-danger'`, `derived: 'border-dg-text-3/50'`.
- Textes `text-xs` → `text-[11px]`, `text-[10px]` inchangés.

- [ ] **Step 4 : vérifier**

Run : `cd plugin && npx tsc --noEmit && npx vitest run`
Expected : aucune erreur ; `Tests  202 passed (202)` (garde comprise).

- [ ] **Step 5 : commit**

```bash
git add plugin/src/ui/noHardcodedColors.test.ts plugin/src/ui/diff/DiffScreen.tsx plugin/src/ui/diff/DiffCanvas.tsx plugin/src/ui/diff/NodeDetail.tsx plugin/src/ui/diff/DiffChips.tsx
git commit -m "feat(plugin): diff redessiné sur les jetons, garde anti-couleurs en dur"
```
(ajouter nommément tout autre fichier corrigé à cause de la garde)

---

### Task 8 : Documentation et vérification dans Figma

**Files :**
- Modify : `CHANGELOG.md` (section `[Unreleased]`)

- [ ] **Step 1 : CHANGELOG** — sous `[Unreleased]` :

```markdown
### Changed
- Plugin : nouvelle interface « Figma natif » qui suit le thème clair/sombre de Figma ; résumé IA du dernier checkpoint en tête de l'accueil ; liste des frames façon panneau Calques.
- Plugin : l'historique du fichier s'ouvre automatiquement (plus d'écran « Choisir un asset ») ; branches masquées (toujours `main`).
- Plugin : offre limitée à Free et Pro.
```

- [ ] **Step 2 : suites complètes**

Run : `cd plugin && npx tsc --noEmit && npx vitest run` puis `cd ../backend && npx vitest run`
Expected : plugin `202 passed`, backend `319 passed`.

- [ ] **Step 3 : commit**

```bash
git add CHANGELOG.md
git commit -m "docs: nouvelle UI du plugin au changelog"
```

- [ ] **Step 4 : vérification manuelle (utilisateur)** — `cd plugin && npx vite build && npx vite build --config vite.main.config.ts`, puis dans Figma, en thème **sombre puis clair** :
  - premier lancement sur un fichier sans historique → accueil direct, historique créé au nom du fichier ;
  - réouverture → même historique, affichage immédiat ;
  - cocher/décocher des frames, capturer, résumé IA dans la carte d'accueil ;
  - clic frame → historique → diff (◀▶, Avant/Après, détail d'un nœud) ;
  - restauration depuis un diff de page ;
  - menu ⋯ : lier le compte ; sélecteur d'historique si le fichier en a plusieurs ;
  - offre : Free et Pro seulement ;
  - aucun texte illisible en thème clair.
