# AI Patch Note asynchrone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sortir l'appel OpenAI du chemin synchrone de `POST /api/checkpoints` pour rendre la capture quasi instantanée, le Patch Note étant généré en arrière-plan puis récupéré par polling côté plugin.

**Architecture:** Service `generateAndStoreSummary` (fire-and-forget non-awaité sur Node/Railway) appelé après la réponse du POST ; deux endpoints `GET /api/checkpoints/:id` (polling) et `POST /api/checkpoints/:id/regenerate` (filet) ; côté plugin, un util `pollPatchNote` + UI « en cours / régénérer » dans `CheckpointScreen`.

**Tech Stack:** Hono + TypeScript (backend, `Hono<ProjectEnv>`), Supabase, OpenAI `gpt-4o-mini`, Vitest. Plugin Preact (`ui.tsx`), tests Vitest.

**Référence spec :** `docs/superpowers/specs/2026-06-10-async-patch-note-design.md`.

**Types réels :** `DeltaJSON` (`backend/src/types/figma.js`) ; `DiffService.compareSnapshots(v1,v2): DeltaJSON` ; `OpenAIService.generatePatchNote(delta: DeltaJSON, authorName: string): Promise<string>` ; `aiSummariesGeneratedTotal.inc({ status })`.

**Vérif :** `cd backend && npx vitest run` · `cd backend && npx tsc --noEmit` · `cd plugin && npx vitest run` · `cd plugin && npx tsc --noEmit`.

---

## File Structure

| Fichier | Action | Responsabilité |
|---|---|---|
| `backend/src/services/checkpoint-ai.service.ts` | Create | `generateAndStoreSummary` (OpenAI → update + email + métrique) |
| `backend/src/tests/checkpoint-ai.service.test.ts` | Create | tests du service |
| `backend/src/controllers/checkpoints.controller.ts` | Modify | POST async ; `GET /:id` ; `POST /:id/regenerate` ; retrait console.log + IA bloquante |
| `backend/src/services/openapi.ts` | Modify | doc des 2 endpoints |
| `plugin/src/patchNote.ts` | Create | `pollPatchNote` (util testable) |
| `plugin/src/patchNote.test.ts` | Create | tests du polling |
| `plugin/src/ui.tsx` | Modify | `CheckpointScreen` : capture `version.id`, état en-cours/indispo, bouton Régénérer |

---

## Task 1: Service `generateAndStoreSummary` (TDD)

**Files:**
- Create: `backend/src/services/checkpoint-ai.service.ts`
- Test: `backend/src/tests/checkpoint-ai.service.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/tests/checkpoint-ai.service.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeltaJSON } from '../types/figma.js';

// ── mocks ──────────────────────────────────────────────────────────────────────
const mockUpdateEq = vi.fn(() => Promise.resolve({ data: null, error: null }));
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockFrom = vi.fn(() => ({ update: mockUpdate }));
vi.mock('../config/supabase.js', () => ({ getSupabaseClient: () => ({ from: mockFrom }) }));

const mockGenerate = vi.fn(async () => 'Résumé IA');
vi.mock('../services/openai.service.js', () => ({
  OpenAIService: class { generatePatchNote = mockGenerate; },
}));

const mockInc = vi.fn();
vi.mock('../services/metrics.service.js', () => ({ aiSummariesGeneratedTotal: { inc: mockInc } }));

const mockSendCheckpoint = vi.fn(async () => ({ sent: true }));
vi.mock('../services/notification.service.js', () => ({ sendCheckpointNotification: mockSendCheckpoint }));

vi.mock('../config/env.js', () => ({ getEnv: () => ({ OPENAI_API_KEY: 'k' }) }));

import { generateAndStoreSummary } from '../services/checkpoint-ai.service.js';

const delta = { totalChanges: 3 } as unknown as DeltaJSON;

describe('generateAndStoreSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('génère, écrit ai_summary et incrémente la métrique success', async () => {
    const ok = await generateAndStoreSummary({
      versionId: 'v1', delta, authorName: 'Alice',
      branchName: 'main', versionNumber: 2, projectName: 'Logo',
    });
    expect(ok).toBe(true);
    expect(mockGenerate).toHaveBeenCalledWith(delta, 'Alice');
    expect(mockFrom).toHaveBeenCalledWith('versions');
    expect(mockUpdate).toHaveBeenCalledWith({ ai_summary: 'Résumé IA' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'v1');
    expect(mockInc).toHaveBeenCalledWith({ status: 'success' });
  });

  it('envoie l\'email checkpoint si notifyEmail fourni', async () => {
    await generateAndStoreSummary({
      versionId: 'v1', delta, authorName: 'Alice', notifyEmail: 'a@b.co',
      branchName: 'main', versionNumber: 2, projectName: 'Logo',
    });
    expect(mockSendCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
      to: 'a@b.co', aiSummary: 'Résumé IA', projectName: 'Logo', versionNumber: 2,
    }));
  });

  it('en cas d\'échec OpenAI : renvoie false, métrique error, pas de throw', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('boom'));
    const ok = await generateAndStoreSummary({
      versionId: 'v1', delta, authorName: 'Alice',
      branchName: 'main', versionNumber: 2, projectName: 'Logo',
    });
    expect(ok).toBe(false);
    expect(mockInc).toHaveBeenCalledWith({ status: 'error' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `cd backend && npx vitest run src/tests/checkpoint-ai.service.test.ts`
Expected: FAIL — module/fonction introuvable.

- [ ] **Step 3: Implémenter le service**

Créer `backend/src/services/checkpoint-ai.service.ts` :

```ts
import { getSupabaseClient } from '../config/supabase.js';
import { getEnv } from '../config/env.js';
import { OpenAIService } from './openai.service.js';
import { aiSummariesGeneratedTotal } from './metrics.service.js';
import { sendCheckpointNotification } from './notification.service.js';
import type { DeltaJSON } from '../types/figma.js';

let openai: OpenAIService | null = null;
const getOpenAI = () => (openai ??= new OpenAIService(getEnv().OPENAI_API_KEY));

export interface GenerateSummaryParams {
  versionId: string;
  delta: DeltaJSON;
  authorName: string;
  branchName: string;
  versionNumber: number;
  projectName: string;
  notifyEmail?: string | null;
}

/**
 * Génère le AI Patch Note d'une version et l'écrit en base.
 * Best-effort : ne throw jamais (appelé en fire-and-forget). Renvoie true si l'écriture a réussi.
 */
export async function generateAndStoreSummary(p: GenerateSummaryParams): Promise<boolean> {
  let summary: string;
  try {
    summary = await getOpenAI().generatePatchNote(p.delta, p.authorName);
  } catch {
    aiSummariesGeneratedTotal.inc({ status: 'error' });
    return false;
  }

  const { error } = await getSupabaseClient()
    .from('versions')
    .update({ ai_summary: summary })
    .eq('id', p.versionId);

  if (error) {
    aiSummariesGeneratedTotal.inc({ status: 'error' });
    return false;
  }

  aiSummariesGeneratedTotal.inc({ status: 'success' });

  if (p.notifyEmail) {
    sendCheckpointNotification({
      to: p.notifyEmail,
      authorName: p.authorName,
      projectName: p.projectName,
      branchName: p.branchName,
      versionNumber: p.versionNumber,
      aiSummary: summary,
    }).catch(() => { /* best-effort */ });
  }

  return true;
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `cd backend && npx vitest run src/tests/checkpoint-ai.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/checkpoint-ai.service.ts backend/src/tests/checkpoint-ai.service.test.ts
git commit -m "feat(checkpoints): async patch-note generation service"
```

---

## Task 2: `POST /api/checkpoints` — sortir l'IA du chemin synchrone

**Files:**
- Modify: `backend/src/controllers/checkpoints.controller.ts`

> Le repo n'a pas de test de route pour ce controller ; vérification par `tsc` + suite complète. La logique testable (génération) est couverte par Task 1.

- [ ] **Step 1: Mettre à jour les imports**

Dans `backend/src/controllers/checkpoints.controller.ts`, remplacer l'import de notification par le service :

Retirer :
```ts
import { sendCheckpointNotification } from '../services/notification.service.js';
```
Ajouter :
```ts
import { generateAndStoreSummary } from '../services/checkpoint-ai.service.js';
```

- [ ] **Step 2: Sélectionner le nom de l'asset (pour l'email)**

Remplacer la requête d'ownership (≈ lignes 72-77) :
```ts
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('id, project_id')
    .eq('id', body.asset_id)
    .eq('project_id', projectId)
    .single();
```
par (ajout de `name`) :
```ts
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('id, project_id, name')
    .eq('id', body.asset_id)
    .eq('project_id', projectId)
    .single();
```

- [ ] **Step 3: Rendre la génération IA asynchrone**

Remplacer le bloc « 5. Diff + résumé IA » (≈ lignes 121-140), c.-à-d. :
```ts
  let analysisJson = null;
  let aiSummary = null;

  if (prev?.storage_path) {
    const prevSnapshot = await downloadSnapshot(prev.storage_path);

    if (prevSnapshot) {
      const delta = diffService.compareSnapshots(prevSnapshot, body.snapshot_json as FigmaSnapshot);
      analysisJson = delta;

      if (delta.totalChanges > 0) {
        aiSummary = await getOpenAI().generatePatchNote(delta, body.author.name);
        aiSummariesGeneratedTotal.inc({ status: 'success' });
      } else {
        aiSummary = 'Aucune modification détectée.';
      }
    }
  }
```
par (le diff reste synchrone ; l'IA part en arrière-plan) :
```ts
  let analysisJson = null;
  let aiSummary: string | null = null;
  let pendingDelta = null;

  if (prev?.storage_path) {
    const prevSnapshot = await downloadSnapshot(prev.storage_path);

    if (prevSnapshot) {
      const delta = diffService.compareSnapshots(prevSnapshot, body.snapshot_json as FigmaSnapshot);
      analysisJson = delta;

      if (delta.totalChanges > 0) {
        pendingDelta = delta;          // génération IA différée (après la réponse)
      } else {
        aiSummary = 'Aucune modification détectée.';
      }
    }
  }
```

- [ ] **Step 4: Retirer le console.log de debug**

Dans le bloc « 6b » (upload render), remplacer la ligne :
```ts
    console.log('[DG] render upload:', renderErr ? `FAILED: ${JSON.stringify(renderErr)}` : `OK → ${renderPath}`);
```
par :
```ts
    if (renderErr) { /* render best-effort — ignore l'échec d'upload du rendu */ }
```

- [ ] **Step 5: Lancer la génération en fire-and-forget après l'insert, et adapter la réponse**

Remplacer le bloc final (≈ lignes 185-199), c.-à-d. :
```ts
  checkpointsCreatedTotal.inc();

  // Fire-and-forget — ne bloque pas la réponse si Resend est absent/hors ligne
  if (body.notify_email) {
    sendCheckpointNotification({
      to: body.notify_email,
      authorName: body.author.name,
      projectName: body.figma_node_id ?? 'Design Guardian',
      branchName: body.branch_name,
      versionNumber: nextVersion,
      aiSummary,
    }).catch(() => { /* silent — notifications are best-effort */ });
  }

  return c.json<CheckpointResponse>({ version, analysis: analysisJson, ai_summary: aiSummary }, 201);
```
par :
```ts
  checkpointsCreatedTotal.inc();

  // Génération IA en arrière-plan (fire-and-forget, process long-running Railway).
  // La réponse part immédiatement avec ai_summary = null ; le plugin récupère le résumé par polling.
  if (pendingDelta) {
    void generateAndStoreSummary({
      versionId: version.id,
      delta: pendingDelta,
      authorName: body.author.name,
      branchName: body.branch_name,
      versionNumber: nextVersion,
      projectName: asset.name ?? 'Design Guardian',
      notifyEmail: body.notify_email ?? null,
    });
  } else if (body.notify_email) {
    // Cas 0-changement (ou premier checkpoint) : email best-effort avec le résumé constant/absent
    sendCheckpointNotification({
      to: body.notify_email,
      authorName: body.author.name,
      projectName: asset.name ?? 'Design Guardian',
      branchName: body.branch_name,
      versionNumber: nextVersion,
      aiSummary,
    }).catch(() => {});
  }

  return c.json<CheckpointResponse>({ version, analysis: analysisJson, ai_summary: aiSummary }, 201);
```

- [ ] **Step 6: Nettoyer les imports inutilisés**

`getOpenAI` / `OpenAIService` ne sont peut-être plus utilisés dans ce fichier (la génération est passée dans le service). De même `aiSummariesGeneratedTotal` n'est plus incrémenté ici. **Lancer `tsc`** et retirer tout import/élément devenu inutilisé qu'il signale (TypeScript strict `noUnusedLocals` le détecte). Garder `diffService`, `downloadSnapshot`, `uploadSnapshot`, `checkpointsCreatedTotal`.

- [ ] **Step 7: Typecheck + suite**

Run: `cd backend && npx tsc --noEmit` → zéro erreur.
Run: `cd backend && npx vitest run` → vert.

- [ ] **Step 8: Commit**

```bash
git add backend/src/controllers/checkpoints.controller.ts
git commit -m "feat(checkpoints): non-blocking capture — defer AI patch note off the request path"
```

---

## Task 3: `GET /api/checkpoints/:id` (polling)

**Files:**
- Modify: `backend/src/controllers/checkpoints.controller.ts`

- [ ] **Step 1: Ajouter la route avant `export { checkpointsRouter }`**

```ts
// GET /api/checkpoints/:id — récupère une version (pour le polling du Patch Note).
// Ownership : la version doit appartenir à un asset du projet courant.
checkpointsRouter.get('/:id', pluginMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json<ErrorResponse>({ error: 'Checkpoint id is required' }, 400);

  const { data, error } = await getSupabaseClient()
    .from('versions')
    .select('*, assets!inner(project_id)')
    .eq('id', id)
    .eq('assets.project_id', c.get('projectId'))
    .single();

  if (error || !data) return c.json<ErrorResponse>({ error: 'Checkpoint not found' }, 404);
  return c.json({ version: data });
});
```

> `getSupabaseClient` est déjà importé. `pluginMiddleware`, `ErrorResponse` aussi.

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit` → zéro erreur.

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/checkpoints.controller.ts
git commit -m "feat(checkpoints): GET /:id endpoint for patch-note polling"
```

---

## Task 4: `POST /api/checkpoints/:id/regenerate` (filet)

**Files:**
- Modify: `backend/src/controllers/checkpoints.controller.ts`

- [ ] **Step 1: Ajouter la route avant `export { checkpointsRouter }`**

```ts
// POST /api/checkpoints/:id/regenerate — relance la génération du Patch Note
// à partir de l'analysis_json déjà stocké (pas de re-diff). Filet en cas d'échec async.
checkpointsRouter.post('/:id/regenerate', pluginMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json<ErrorResponse>({ error: 'Checkpoint id is required' }, 400);

  const { data: version, error } = await getSupabaseClient()
    .from('versions')
    .select('id, analysis_json, branch_name, version_number, author_name, assets!inner(project_id, name)')
    .eq('id', id)
    .eq('assets.project_id', c.get('projectId'))
    .single();

  if (error || !version) return c.json<ErrorResponse>({ error: 'Checkpoint not found' }, 404);
  if (!version.analysis_json) return c.json<ErrorResponse>({ error: 'Nothing to regenerate' }, 400);

  const assetRel = version.assets as unknown as { name: string | null };
  const ok = await generateAndStoreSummary({
    versionId: version.id,
    delta: version.analysis_json as DeltaJSON,
    authorName: version.author_name ?? 'Anonyme',
    branchName: version.branch_name,
    versionNumber: version.version_number,
    projectName: assetRel?.name ?? 'Design Guardian',
  });
  if (!ok) return c.json<ErrorResponse>({ error: 'Regeneration failed' }, 502);

  const { data: updated } = await getSupabaseClient()
    .from('versions').select('*').eq('id', id).single();
  return c.json({ version: updated });
});
```

- [ ] **Step 2: Ajouter l'import du type**

En tête de `checkpoints.controller.ts`, ajouter si absent :
```ts
import type { DeltaJSON } from '../types/figma.js';
```

- [ ] **Step 3: Typecheck + suite**

Run: `cd backend && npx tsc --noEmit` → zéro erreur.
Run: `cd backend && npx vitest run` → vert.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/checkpoints.controller.ts
git commit -m "feat(checkpoints): POST /:id/regenerate fallback for patch note"
```

---

## Task 5: Documentation OpenAPI des 2 endpoints

**Files:**
- Modify: `backend/src/services/openapi.ts`

- [ ] **Step 1: Ajouter les 2 chemins**

Ouvrir `backend/src/services/openapi.ts`, repérer l'objet `paths` (les routes `/api/checkpoints` existantes) et y ajouter, en suivant le format des entrées voisines :

```ts
    '/api/checkpoints/{id}': {
      get: {
        tags: ['Checkpoints'],
        summary: 'Récupère une version (polling du AI Patch Note)',
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Version' }, '404': { description: 'Not found' } },
      },
    },
    '/api/checkpoints/{id}/regenerate': {
      post: {
        tags: ['Checkpoints'],
        summary: 'Régénère le AI Patch Note depuis le delta stocké',
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Version mise à jour' }, '400': { description: 'Nothing to regenerate' }, '404': { description: 'Not found' } },
      },
    },
```

> Adapter les clés (`tags`, `security` scheme name) à ce qui existe déjà dans le fichier. Si la structure diffère, suivre le motif exact des routes voisines plutôt que ce gabarit.

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit` → zéro erreur.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/openapi.ts
git commit -m "docs(openapi): document checkpoint GET/:id and regenerate"
```

---

## Task 6: Plugin — util de polling `pollPatchNote` (TDD)

**Files:**
- Create: `plugin/src/patchNote.ts`
- Test: `plugin/src/patchNote.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `plugin/src/patchNote.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import { pollPatchNote } from './patchNote.js';

describe('pollPatchNote', () => {
  it('renvoie le résumé dès qu\'il est disponible', async () => {
    const fetchVersion = vi.fn()
      .mockResolvedValueOnce({ ai_summary: null })
      .mockResolvedValueOnce({ ai_summary: 'Résumé prêt' });
    const result = await pollPatchNote(fetchVersion, { intervalMs: 0, maxTries: 5 });
    expect(result).toBe('Résumé prêt');
    expect(fetchVersion).toHaveBeenCalledTimes(2);
  });

  it('renvoie null après maxTries si jamais rempli (timeout)', async () => {
    const fetchVersion = vi.fn().mockResolvedValue({ ai_summary: null });
    const result = await pollPatchNote(fetchVersion, { intervalMs: 0, maxTries: 3 });
    expect(result).toBeNull();
    expect(fetchVersion).toHaveBeenCalledTimes(3);
  });

  it('ignore une erreur ponctuelle de fetch et continue', async () => {
    const fetchVersion = vi.fn()
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce({ ai_summary: 'OK' });
    const result = await pollPatchNote(fetchVersion, { intervalMs: 0, maxTries: 5 });
    expect(result).toBe('OK');
  });
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `cd plugin && npx vitest run src/patchNote.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

Créer `plugin/src/patchNote.ts` :

```ts
export interface PollOptions { intervalMs: number; maxTries: number }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Interroge `fetchVersion` jusqu'à obtenir un ai_summary non vide, ou jusqu'à maxTries.
 * Best-effort : une erreur de fetch est ignorée (on retente). Renvoie le résumé, ou null si timeout.
 */
export async function pollPatchNote(
  fetchVersion: () => Promise<{ ai_summary: string | null }>,
  { intervalMs, maxTries }: PollOptions,
): Promise<string | null> {
  for (let i = 0; i < maxTries; i++) {
    try {
      const v = await fetchVersion();
      if (v.ai_summary) return v.ai_summary;
    } catch {
      /* retry */
    }
    if (i < maxTries - 1) await sleep(intervalMs);
  }
  return null;
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `cd plugin && npx vitest run src/patchNote.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugin/src/patchNote.ts plugin/src/patchNote.test.ts
git commit -m "feat(plugin): pollPatchNote polling util"
```

---

## Task 7: Plugin — `CheckpointScreen` async UX (en cours / régénérer)

**Files:**
- Modify: `plugin/src/ui.tsx`

> Vérification par `tsc` + build plugin (pas de test de composant ; la logique testable est dans `pollPatchNote`, Task 6).

- [ ] **Step 1: Importer le util**

En tête de `plugin/src/ui.tsx`, ajouter :
```ts
import { pollPatchNote } from './patchNote.js';
```

- [ ] **Step 2: Capturer `version.id` + l'état pending dans `save()`**

Dans `CheckpointScreen`, remplacer l'état `saved` et la fonction `save` (≈ lignes 372-394) :

```ts
  const [saved, setSaved] = useState<{ summary: string | null; changes: number } | null>(null);

  const save = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await api<{ version: { id: string }; ai_summary: string | null; analysis: { totalChanges?: number } | null }>(
        apiKey, '/api/checkpoints', {
          method: 'POST',
          body: JSON.stringify({
            asset_id:        asset.id,
            branch_name:     branchName.trim() || 'main',
            figma_node_id:   snapshot.figmaNodeId,
            snapshot_json:   snapshot,
            render_svg_b64:  renderSvgB64,
            author: { figma_id: author.figma_id, name: author.name, avatar_url: author.avatar_url },
          }),
        }
      );
      setSaved({ summary: data.ai_summary, changes: data.analysis?.totalChanges ?? 0, versionId: data.version.id });
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [apiKey, asset.id, branchName, snapshot, author, renderSvgB64]);
```

Et adapter le type de `saved` :
```ts
  const [saved, setSaved] = useState<{ summary: string | null; changes: number; versionId: string } | null>(null);
```
(remplacer la déclaration précédente — ne pas la dupliquer).

- [ ] **Step 3: Polling + état régénérer dans la vue succès**

Ajouter, juste avant le `if (saved) return (...)`, la logique de polling et l'état local :

```ts
  const [patchNote, setPatchNote] = useState<string | null>(null);
  const [patchState, setPatchState] = useState<'idle' | 'pending' | 'timeout'>('idle');
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!saved) return;
    if (saved.summary) { setPatchNote(saved.summary); setPatchState('idle'); return; }
    if (saved.changes <= 0) { setPatchState('idle'); return; } // 0-changement : pas de génération
    setPatchState('pending');
    let cancelled = false;
    pollPatchNote(
      () => api<{ version: { ai_summary: string | null } }>(apiKey, `/api/checkpoints/${saved.versionId}`)
              .then((d) => ({ ai_summary: d.version.ai_summary })),
      { intervalMs: 2000, maxTries: 8 },
    ).then((summary) => {
      if (cancelled) return;
      if (summary) { setPatchNote(summary); setPatchState('idle'); }
      else setPatchState('timeout');
    });
    return () => { cancelled = true; };
  }, [saved, apiKey]);

  const regenerate = useCallback(async () => {
    if (!saved) return;
    setRegenerating(true);
    try {
      const d = await api<{ version: { ai_summary: string | null } }>(
        apiKey, `/api/checkpoints/${saved.versionId}/regenerate`, { method: 'POST' });
      if (d.version.ai_summary) { setPatchNote(d.version.ai_summary); setPatchState('idle'); }
      else setPatchState('timeout');
    } catch { setPatchState('timeout'); }
    finally { setRegenerating(false); }
  }, [apiKey, saved]);
```

- [ ] **Step 4: Mettre à jour le rendu de la vue succès**

Remplacer le bloc d'affichage du résumé dans `if (saved) return (...)` (≈ lignes 400-404), c.-à-d. :
```tsx
        <div class="p-4 bg-gray-900 rounded-lg border border-gray-800 flex flex-col gap-1.5">
          <p class="text-xs text-gray-500 font-mono">{branchName}</p>
          <p class="text-sm text-gray-200 leading-relaxed">{saved.summary ?? 'Aucune modification détectée.'}</p>
          {saved.changes > 0 && <p class="text-xs text-purple-400">{saved.changes} modification(s)</p>}
        </div>
```
par :
```tsx
        <div class="p-4 bg-gray-900 rounded-lg border border-gray-800 flex flex-col gap-1.5">
          <p class="text-xs text-gray-500 font-mono">{branchName}</p>
          {patchNote ? (
            <p class="text-sm text-gray-200 leading-relaxed">{patchNote}</p>
          ) : saved.changes <= 0 ? (
            <p class="text-sm text-gray-200 leading-relaxed">Aucune modification détectée.</p>
          ) : patchState === 'pending' ? (
            <p class="text-sm text-gray-400 leading-relaxed flex items-center gap-2"><Spinner /> Patch Note en cours…</p>
          ) : (
            <div class="flex flex-col gap-2">
              <p class="text-sm text-gray-400">Patch Note indisponible.</p>
              <button class="btn-secondary text-xs" onClick={regenerate} disabled={regenerating}>
                {regenerating ? 'Régénération…' : 'Régénérer'}
              </button>
            </div>
          )}
          {saved.changes > 0 && <p class="text-xs text-purple-400">{saved.changes} modification(s)</p>}
        </div>
```

> `Spinner` est déjà défini/utilisé dans `ui.tsx` (cf. HomeScreen). Si son nom diffère, utiliser le composant de spinner existant du fichier.

- [ ] **Step 5: Typecheck + build + suite plugin**

Run: `cd plugin && npx tsc --noEmit` → zéro erreur.
Run: `cd plugin && npx vitest run` → vert.
Run: `cd plugin && npm run build` (si script présent) → succès.

- [ ] **Step 6: Commit**

```bash
git add plugin/src/ui.tsx
git commit -m "feat(plugin): async patch-note UX — pending state + regenerate"
```

---

## Definition of Done

- [ ] `cd backend && npx vitest run` + `npx tsc --noEmit` : verts (suite + `checkpoint-ai.service`).
- [ ] `cd plugin && npx vitest run` + `npx tsc --noEmit` : verts (`pollPatchNote`).
- [ ] `POST /api/checkpoints` répond avec `ai_summary: null` quand il y a des changements (ne bloque plus sur OpenAI) ; constante si 0 changement.
- [ ] `GET /api/checkpoints/:id` et `POST /api/checkpoints/:id/regenerate` existent, ownership vérifié.
- [ ] Plugin : écran « Checkpoint sauvegardé » montre « en cours… » puis le résumé ; timeout → bouton Régénérer.
- [ ] `console.log` debug retiré ; email checkpoint déplacé dans le service (avec un `projectName` correct).
