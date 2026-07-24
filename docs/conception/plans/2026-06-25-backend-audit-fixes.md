# Backend Audit Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les failles cross-tenant et d'abus, supprimer la race condition sur `version_number`, fiabiliser le matching du diff via `dg_id`, rendre le restore explicable (diff + patch note), puis durcir l'observabilité et factoriser les doublons.

**Architecture :** Backend HonoJS (monolithe modulaire) sur Railway, client Supabase en `SERVICE_KEY` (RLS bypass → l'ownership est applicatif). On centralise (a) le contrôle d'ownership des versions et (b) la création de version (claim de slot + upload + insert avec retry) dans des services partagés, testés en isolation par stubs Supabase. Le matcher de diff passe d'un schéma binaire id/path à un matcher en couches `dg_id → id → path`.

**Tech Stack :** TypeScript strict (zéro `any`), Hono, Zod, Vitest, `@supabase/supabase-js`, prom-client, Stripe, OpenAI `gpt-4o-mini`.

## Global Constraints

- TypeScript **strict, zéro `any`** — typage explicite partout.
- Séparation **Controller / Service** conservée ; `figma.*` jamais côté backend.
- **Le moins de code possible / DRY** : factoriser plutôt que dupliquer.
- Quality Gate Vitest : couverture services **≥ 80 %** (statements/lines/functions) — `npm run test:coverage` ne doit pas régresser.
- Migrations SQL : numérotées `NNN_nom.sql`, transactionnelles (`BEGIN/COMMIT`), idempotentes, commentées FR — **à relire puis appliquer manuellement** (SQL Editor Supabase / `supabase db push`), JAMAIS auto-appliquées par le code.
- Chaque tâche se termine par `npm run typecheck` vert + `npm run test:run` vert, puis commit.
- Répertoire backend : `backend/`. Commandes lancées depuis `backend/`.

---

## File Structure

**Créés :**
- `backend/src/services/ownership.service.ts` — garde d'ownership des versions (réutilisable).
- `backend/src/services/versioning.service.ts` — helpers Storage (snapshotPath/upload/download/resolve) + `createVersionAtomic` (claim slot + retry 23505).
- `backend/src/tests/_support/supabase-stub.ts` — fabriques de stubs Supabase pour tests controller/service.
- `backend/src/tests/ownership.service.test.ts`
- `backend/src/tests/versioning.service.test.ts`
- `backend/src/tests/checkpoints.controller.test.ts`
- `backend/src/tests/branches.controller.test.ts`
- `supabase/migrations/012_version_number_unique.sql`

**Modifiés :**
- `backend/src/controllers/branches.controller.ts` — fix ownership status, Zod restore/status, restore via helper + diff, suppression doublons Storage.
- `backend/src/controllers/checkpoints.controller.ts` — création via `createVersionAtomic`, suppression doublons Storage.
- `backend/src/controllers/notifications.controller.ts` — rate-limit + Zod.
- `backend/src/services/diff.service.ts` — matcher en couches `dg_id → id → path`.
- `backend/src/middleware/metrics.middleware.ts` — label `route` = pattern Hono + gauge `try/finally`.
- `backend/src/middleware/auth.middleware.ts` — client anon mémoïsé.
- `backend/src/config/env.ts` — garde prod (METRICS_TOKEN obligatoire, warn CORS).
- `backend/src/types/api.ts` — schémas Zod `restoreSchema`, `statusSchema`.

---

## Phase A — Sécurité P0 (cross-tenant & abus)

### Task A1 : Garde d'ownership des versions + fix IDOR `PUT /versions/:id/status`

**Files:**
- Create: `backend/src/services/ownership.service.ts`
- Create: `backend/src/tests/_support/supabase-stub.ts`
- Create: `backend/src/tests/ownership.service.test.ts`
- Modify: `backend/src/controllers/branches.controller.ts:353-374`
- Modify: `backend/src/types/api.ts` (ajout `statusSchema`)

**Interfaces:**
- Produces: `loadOwnedVersion(db, versionId, projectId): Promise<{ version: Record<string, unknown> } | { error: 'not_found' | 'forbidden' }>`
- Produces (stub): `singleRowDb(row: unknown): Pick<SupabaseClient, 'from'>`

- [ ] **Step 1 : Stub de test réutilisable**

Create `backend/src/tests/_support/supabase-stub.ts` :

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

type Result = { data: unknown; error: { message: string; code?: string } | null };

/** Stub minimal pour une chaîne `.from().select().eq()...single()` qui résout `row`. */
export function singleRowDb(row: unknown): Pick<SupabaseClient, 'from'> {
  const result: Result = row
    ? { data: row, error: null }
    : { data: null, error: { message: 'no rows', code: 'PGRST116' } };
  const thenable = {
    select: () => thenable,
    eq: () => thenable,
    not: () => thenable,
    order: () => thenable,
    limit: () => thenable,
    single: async () => result,
    maybeSingle: async () => result,
  };
  return { from: () => thenable } as unknown as Pick<SupabaseClient, 'from'>;
}
```

- [ ] **Step 2 : Test qui échoue**

Create `backend/src/tests/ownership.service.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { loadOwnedVersion } from '../services/ownership.service.js';
import { singleRowDb } from './_support/supabase-stub.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const asDb = (row: unknown) => singleRowDb(row) as unknown as SupabaseClient;

describe('loadOwnedVersion', () => {
  it('renvoie la version (sans assets) quand le projet correspond', async () => {
    const row = { id: 'v1', status: 'draft', assets: { project_id: 'p1' } };
    const res = await loadOwnedVersion(asDb(row), 'v1', 'p1');
    expect(res).toEqual({ version: { id: 'v1', status: 'draft' } });
  });

  it('renvoie forbidden quand le projet diffère', async () => {
    const row = { id: 'v1', assets: { project_id: 'OTHER' } };
    const res = await loadOwnedVersion(asDb(row), 'v1', 'p1');
    expect(res).toEqual({ error: 'forbidden' });
  });

  it('renvoie not_found quand la version est absente', async () => {
    const res = await loadOwnedVersion(asDb(null), 'v1', 'p1');
    expect(res).toEqual({ error: 'not_found' });
  });
});
```

Run: `npm run test:run -- src/tests/ownership.service.test.ts`
Expected: FAIL (`loadOwnedVersion` introuvable).

- [ ] **Step 3 : Implémentation**

Create `backend/src/services/ownership.service.ts` :

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type OwnershipResult =
  | { version: Record<string, unknown> }
  | { error: 'not_found' | 'forbidden' };

/**
 * Charge une version et vérifie qu'elle appartient au projet (X-API-Key).
 * Le client Supabase tourne en SERVICE_KEY (RLS bypass) → ce garde applicatif
 * est la SEULE barrière cross-tenant. Renvoie la version sans la jointure `assets`.
 */
export async function loadOwnedVersion(
  db: SupabaseClient,
  versionId: string,
  projectId: string,
): Promise<OwnershipResult> {
  const { data, error } = await db
    .from('versions')
    .select('*, assets!inner(project_id)')
    .eq('id', versionId)
    .single();

  if (error || !data) return { error: 'not_found' };

  const projId = (data.assets as { project_id: string } | null)?.project_id;
  if (projId !== projectId) return { error: 'forbidden' };

  const { assets: _assets, ...version } = data as Record<string, unknown> & { assets: unknown };
  return { version };
}
```

Run: `npm run test:run -- src/tests/ownership.service.test.ts`
Expected: PASS.

- [ ] **Step 4 : Schéma Zod du status**

In `backend/src/types/api.ts`, après `portalSchema` :

```ts
// ── Branches / versions (plugin) ──────────────────────────────────────────────
export const statusSchema = z.object({
  status: z.enum(['draft', 'review', 'approved']),
});
export type StatusRequest = z.infer<typeof statusSchema>;
```

- [ ] **Step 5 : Corriger la route status (ownership + Zod)**

In `backend/src/controllers/branches.controller.ts`, remplacer le handler `PUT /versions/:id/status` (lignes 353-374) :

```ts
branchesRouter.put('/versions/:id/status', pluginMiddleware, zValidator('json', statusSchema), async (c) => {
  const id = c.req.param('id');
  const { status } = c.req.valid('json');

  const owned = await loadOwnedVersion(getSupabaseClient(), id, c.get('projectId'));
  if ('error' in owned) {
    return owned.error === 'forbidden'
      ? c.json<ErrorResponse>({ error: 'Forbidden' }, 403)
      : c.json<ErrorResponse>({ error: 'Version not found' }, 404);
  }

  const update: Partial<Version> = {
    status,
    approved_by: status === 'approved' ? c.get('projectId') : null,
    approved_at: status === 'approved' ? new Date().toISOString() : null,
  };

  const { data, error } = await getSupabaseClient()
    .from('versions').update(update).eq('id', id).select().single();

  if (error || !data) return c.json<ErrorResponse>({ error: 'Version not found', details: error?.message }, 404);
  return c.json<ApproveVersionResponse>({ version: data });
});
```

Add imports en tête de `branches.controller.ts` :

```ts
import { zValidator } from '@hono/zod-validator';
import { loadOwnedVersion } from '../services/ownership.service.js';
import { statusSchema } from '../types/api.js';
```

- [ ] **Step 6 : Vérifier typecheck + tests**

Run: `npm run typecheck && npm run test:run`
Expected: PASS, aucune régression.

- [ ] **Step 7 : Commit**

```bash
git add backend/src/services/ownership.service.ts backend/src/tests/ownership.service.test.ts backend/src/tests/_support/supabase-stub.ts backend/src/controllers/branches.controller.ts backend/src/types/api.ts
git commit -m "fix(security): ownership guard on version status route (cross-tenant IDOR) + Zod"
```

---

### Task A2 : Anti-abus sur `notifications/*` (rate-limit + validation)

**Files:**
- Modify: `backend/src/controllers/notifications.controller.ts`

**Interfaces:**
- Consumes: `pluginMiddleware` (fournit `projectId`).
- Produces: rien d'exporté ; rate-limit interne par `projectId`.

- [ ] **Step 1 : Rate-limiter par projet + validation Zod**

Remplacer l'intégralité de `backend/src/controllers/notifications.controller.ts` :

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import {
  sendEmail,
  sendCheckpointNotification,
  sendVerificationSms,
} from '../services/notification.service.js';
import type { ErrorResponse } from '../types/api.js';
import type { ProjectEnv } from '../types/hono.js';

const notificationsRouter = new Hono<ProjectEnv>();

// Anti-abus : ces routes déclenchent un coût externe (Resend/Twilio) et l'API key
// s'obtient librement via /auto-init. Plafond glissant par projet (mémoire process).
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1h
const _bucket = new Map<string, { n: number; resetAt: number }>();
function rateLimited(projectId: string): boolean {
  const now = Date.now();
  const b = _bucket.get(projectId);
  if (!b || b.resetAt < now) { _bucket.set(projectId, { n: 1, resetAt: now + RATE_WINDOW_MS }); return false; }
  if (b.n >= RATE_MAX) return true;
  b.n++;
  return false;
}

const checkpointBody = z.object({
  to: z.string().email(),
  authorName: z.string().min(1),
  projectName: z.string().min(1),
  branchName: z.string().min(1),
  versionNumber: z.number(),
  aiSummary: z.string().nullable().optional(),
});

notificationsRouter.post('/checkpoint', pluginMiddleware, zValidator('json', checkpointBody), async (c) => {
  if (rateLimited(c.get('projectId'))) return c.json<ErrorResponse>({ error: 'Rate limit exceeded' }, 429);
  const body = c.req.valid('json');
  const result = await sendCheckpointNotification({ ...body, aiSummary: body.aiSummary ?? null });
  if (!result.sent) return c.json({ sent: false, error: result.error }, 200);
  return c.json({ sent: true, id: result.id }, 200);
});

// Code de vérification : généré CÔTÉ SERVEUR (jamais reçu du client) pour éviter
// le relais SMS ouvert. On renvoie uniquement le statut d'envoi.
const smsBody = z.object({ to: z.string().min(5).max(20) });

notificationsRouter.post('/sms/verify', pluginMiddleware, zValidator('json', smsBody), async (c) => {
  if (rateLimited(c.get('projectId'))) return c.json<ErrorResponse>({ error: 'Rate limit exceeded' }, 429);
  const { to } = c.req.valid('json');
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 chiffres
  const result = await sendVerificationSms(to, code);
  if (!result.sent) return c.json({ sent: false, error: result.error }, 200);
  // NB : la vérification du code est portée par Supabase Phone OTP côté frontend ;
  // cette route reste un utilitaire de démo. Le code n'est pas renvoyé au client.
  return c.json({ sent: true, sid: result.sid }, 200);
});

const testBody = z.object({ to: z.string().email() });

notificationsRouter.post('/test', pluginMiddleware, zValidator('json', testBody), async (c) => {
  if (rateLimited(c.get('projectId'))) return c.json<ErrorResponse>({ error: 'Rate limit exceeded' }, 429);
  const { to } = c.req.valid('json');
  const result = await sendEmail(
    to,
    '[Design Guardian] Test de notification',
    `<div style="font-family:sans-serif;padding:24px">
      <h2>✅ Notifications opérationnelles</h2>
      <p>Le service de notifications Design Guardian fonctionne correctement.</p>
    </div>`,
  );
  return c.json({ sent: result.sent, id: result.id, error: result.error }, 200);
});

export { notificationsRouter };
```

> **Décision produit à confirmer :** le flux « mot de passe oublié par SMS » officiel passe par Supabase Phone OTP côté `frontend/` (cf. mémoire projet). Cette route `/sms/verify` devient un utilitaire de démo qui génère le code lui-même. Si elle ne sert plus, la supprimer entièrement est encore plus sûr.

- [ ] **Step 2 : Typecheck + tests**

Run: `npm run typecheck && npm run test:run`
Expected: PASS.

- [ ] **Step 3 : Commit**

```bash
git add backend/src/controllers/notifications.controller.ts
git commit -m "fix(security): rate-limit + Zod on notifications; server-side SMS code (no open relay)"
```

---

## Phase B — Correctness P0 (race `version_number`)

### Task B1 : Migration — contrainte d'unicité `(asset_id, branch_name, version_number)`

**Files:**
- Create: `supabase/migrations/012_version_number_unique.sql`

- [ ] **Step 1 : Écrire la migration**

Create `supabase/migrations/012_version_number_unique.sql` :

```sql
-- Migration 012 : unicité du numéro de version par (asset, branche)
-- À RELIRE puis appliquer (SQL Editor Supabase, ou `supabase db push`).
-- Transactionnel : tout passe ou rien.
--
-- Le backend calcule version_number en lecture-puis-écriture : deux checkpoints
-- concurrents sur le même asset/branche pouvaient viser le même numéro (race).
-- Cette contrainte rend la collision détectable (SQLSTATE 23505) → le backend
-- retombe et réessaie avec le numéro suivant (createVersionAtomic).

BEGIN;

-- Garde-fou : échoue explicitement s'il existe déjà des doublons à nettoyer.
DO $$
DECLARE dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT asset_id, branch_name, version_number
    FROM public.versions
    GROUP BY asset_id, branch_name, version_number
    HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Doublons (asset_id, branch_name, version_number) présents (%): nettoyer avant d''ajouter la contrainte', dup_count;
  END IF;
END $$;

ALTER TABLE public.versions
  ADD CONSTRAINT versions_asset_branch_vnum_unique
  UNIQUE (asset_id, branch_name, version_number);

COMMIT;
```

- [ ] **Step 2 : Commit**

```bash
git add supabase/migrations/012_version_number_unique.sql
git commit -m "feat(db): unique constraint on (asset_id, branch_name, version_number)"
```

---

### Task B2 : Service `versioning` — helpers Storage + `createVersionAtomic` (retry 23505)

**Files:**
- Create: `backend/src/services/versioning.service.ts`
- Create: `backend/src/tests/versioning.service.test.ts`

**Interfaces:**
- Produces: `snapshotPath(assetId, branch, n): string`
- Produces: `uploadSnapshot(path, snapshot): Promise<string | null>`
- Produces: `downloadSnapshot(path): Promise<FigmaSnapshot | null>`
- Produces: `resolveSnapshot(version): Promise<FigmaSnapshot | null>`
- Produces:
  ```ts
  interface PrevVersion { id: string; version_number: number; storage_path: string | null }
  interface CreateVersionInput {
    assetId: string;
    branchName: string;
    snapshot: FigmaSnapshot;
    renderB64?: string | null;
    figmaNodeId?: string | null;
    author: { figma_id: string; name: string; avatar_url?: string };
    computeMeta: (prev: PrevVersion | null) => Promise<{ analysisJson: DeltaJSON | null; aiSummary: string | null }>;
  }
  type CreateVersionResult =
    | { ok: true; version: Version; prev: PrevVersion | null; analysisJson: DeltaJSON | null }
    | { ok: false; status: 404 | 409 | 500; error: string };
  createVersionAtomic(db, storage, input): Promise<CreateVersionResult>
  ```
  (`db`/`storage` injectés pour testabilité ; les controllers passent `getSupabaseClient()` / `getSupabaseStorage()`.)

- [ ] **Step 1 : Test qui échoue (retry sur collision)**

Create `backend/src/tests/versioning.service.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import { createVersionAtomic } from '../services/versioning.service.js';
import type { FigmaSnapshot } from '../types/figma.js';

const snap = { figmaNodeId: 'n', figmaNodeName: 'N', capturedAt: 't',
  root: { id: 'r', name: 'N', type: 'FRAME', x: 0, y: 0, width: 1, height: 1, opacity: 1, fills: [], strokes: [] },
} as unknown as FigmaSnapshot;

// Storage qui réussit toujours (upload/remove).
const storage = () => ({
  from: () => ({
    upload: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
    download: vi.fn(async () => ({ data: null, error: { message: 'x' } })),
  }),
});

// DB scénarisée : prev = v2 ; 1er insert → 23505 ; 2e insert → succès en v4.
function dbWithConflictThenSuccess() {
  let inserts = 0;
  const prev = { id: 'p', version_number: 2, storage_path: null };
  return {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: prev, error: null }) }) }) }) }) }),
      insert: () => ({ select: () => ({ single: async () => {
        inserts++;
        if (inserts === 1) return { data: null, error: { message: 'dup', code: '23505' } };
        return { data: { id: 'v', version_number: 4, branch_name: 'main' }, error: null };
      } }) }),
    }),
    _inserts: () => inserts,
  };
}

describe('createVersionAtomic', () => {
  it('réessaie après une collision 23505 puis réussit', async () => {
    const db = dbWithConflictThenSuccess();
    const res = await createVersionAtomic(db as never, storage as never, {
      assetId: 'a', branchName: 'main', snapshot: snap,
      author: { figma_id: 'f', name: 'A' },
      computeMeta: async () => ({ analysisJson: null, aiSummary: null }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.version.version_number).toBe(4);
    expect(db._inserts()).toBe(2);
  });
});
```

Run: `npm run test:run -- src/tests/versioning.service.test.ts`
Expected: FAIL (`createVersionAtomic` introuvable).

- [ ] **Step 2 : Implémentation**

Create `backend/src/services/versioning.service.ts` :

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FigmaSnapshot, DeltaJSON } from '../types/figma.js';
import type { Version } from '../types/database.js';

const SNAPSHOTS_BUCKET = 'snapshots';
type Storage = () => ReturnType<SupabaseClient['storage']['from']> extends never ? never : SupabaseClient['storage'];

export function snapshotPath(assetId: string, branch: string, versionNumber: number): string {
  const safeBranch = branch.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${assetId}/${safeBranch}/v${versionNumber}.json`;
}

export async function uploadSnapshot(storage: SupabaseClient['storage'], path: string, snapshot: FigmaSnapshot): Promise<{ error: { message: string } | null }> {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  return storage.from(SNAPSHOTS_BUCKET).upload(path, bytes, { contentType: 'application/json', upsert: false });
}

export async function downloadSnapshot(storage: SupabaseClient['storage'], path: string): Promise<FigmaSnapshot | null> {
  const { data, error } = await storage.from(SNAPSHOTS_BUCKET).download(path);
  if (error || !data) return null;
  try { return JSON.parse(await data.text()) as FigmaSnapshot; } catch { return null; }
}

export async function resolveSnapshot(
  storage: SupabaseClient['storage'],
  version: { snapshot_json: FigmaSnapshot | null; storage_path: string | null },
): Promise<FigmaSnapshot | null> {
  if (version.storage_path) return downloadSnapshot(storage, version.storage_path);
  return version.snapshot_json ?? null;
}

export interface PrevVersion { id: string; version_number: number; storage_path: string | null }

export interface CreateVersionInput {
  assetId: string;
  branchName: string;
  snapshot: FigmaSnapshot;
  renderB64?: string | null;
  figmaNodeId?: string | null;
  author: { figma_id: string; name: string; avatar_url?: string };
  computeMeta: (prev: PrevVersion | null) => Promise<{ analysisJson: DeltaJSON | null; aiSummary: string | null }>;
}

export type CreateVersionResult =
  | { ok: true; version: Version; prev: PrevVersion | null; analysisJson: DeltaJSON | null }
  | { ok: false; status: 404 | 409 | 500; error: string };

const MAX_ATTEMPTS = 5;

/**
 * Crée une version de façon atomique vis-à-vis de la concurrence :
 * claim d'un numéro libre → upload snapshot (upsert:false) → insert. Sur collision
 * (23505 ou upload déjà présent) on incrémente et on réessaie. computeMeta est appelé
 * à chaque tentative avec le `prev` réel du slot retenu (diff calculé pour le bon parent).
 */
export async function createVersionAtomic(
  db: SupabaseClient,
  storage: SupabaseClient['storage'],
  input: CreateVersionInput,
): Promise<CreateVersionResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: prev } = await db
      .from('versions')
      .select('id, version_number, storage_path')
      .eq('asset_id', input.assetId)
      .eq('branch_name', input.branchName)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevTyped = (prev as PrevVersion | null) ?? null;
    const nextVersion = prevTyped ? prevTyped.version_number + 1 : 1;
    const path = snapshotPath(input.assetId, input.branchName, nextVersion);

    const { error: upErr } = await uploadSnapshot(storage, path, input.snapshot);
    if (upErr) continue; // chemin déjà pris par une requête concurrente → on réessaie

    const meta = await input.computeMeta(prevTyped);

    if (input.renderB64) {
      const renderBytes = Buffer.from(JSON.stringify({ svg_b64: input.renderB64 }));
      await storage.from(SNAPSHOTS_BUCKET).upload(path.replace('.json', '_render.json'), renderBytes, { contentType: 'application/json', upsert: true });
    }

    const { data: version, error: insErr } = await db
      .from('versions')
      .insert({
        asset_id: input.assetId,
        parent_id: prevTyped?.id ?? null,
        branch_name: input.branchName,
        version_number: nextVersion,
        author_figma_id: input.author.figma_id,
        author_name: input.author.name,
        author_avatar_url: input.author.avatar_url ?? null,
        figma_node_id: input.figmaNodeId ?? null,
        snapshot_json: null,
        storage_path: path,
        analysis_json: meta.analysisJson,
        ai_summary: meta.aiSummary,
      })
      .select()
      .single();

    if (insErr || !version) {
      await storage.from(SNAPSHOTS_BUCKET).remove([path]);
      if ((insErr as { code?: string } | null)?.code === '23505') continue; // numéro pris entre-temps
      return { ok: false, status: 500, error: insErr?.message ?? 'insert failed' };
    }

    return { ok: true, version: version as Version, prev: prevTyped, analysisJson: meta.analysisJson };
  }
  return { ok: false, status: 409, error: 'Could not allocate a free version number after retries' };
}
```

> Supprimer le type utilitaire `Storage` non utilisé si `tsc` le signale (`noUnusedLocals`). Garder les signatures `SupabaseClient['storage']`.

Run: `npm run test:run -- src/tests/versioning.service.test.ts`
Expected: PASS, `version_number === 4`, 2 inserts.

- [ ] **Step 3 : Typecheck + commit**

```bash
npm run typecheck
git add backend/src/services/versioning.service.ts backend/src/tests/versioning.service.test.ts
git commit -m "feat(versioning): atomic createVersionAtomic with 23505 retry + shared storage helpers"
```

---

### Task B3 : Brancher `POST /checkpoints` sur `createVersionAtomic`

**Files:**
- Modify: `backend/src/controllers/checkpoints.controller.ts:64-224`

**Interfaces:**
- Consumes: `createVersionAtomic`, `downloadSnapshot`, `snapshotPath` (du service versioning).

- [ ] **Step 1 : Remplacer le corps du POST**

Dans `backend/src/controllers/checkpoints.controller.ts`, supprimer les helpers locaux `snapshotPath` / `downloadSnapshot` / `uploadSnapshot` (lignes 18-62) et remplacer le handler `POST /` par :

```ts
checkpointsRouter.post('/', pluginMiddleware, zValidator('json', createCheckpointSchema), async (c) => {
  const supabase = getSupabaseClient();
  const storage = getSupabaseStorage();
  const projectId = c.get('projectId');
  const body = c.req.valid('json');

  // 1. L'asset appartient-il à ce projet ?
  const { data: asset, error: assetError } = await supabase
    .from('assets').select('id, project_id, name').eq('id', body.asset_id).eq('project_id', projectId).single();
  if (assetError || !asset) return c.json<ErrorResponse>({ error: 'Asset not found' }, 404);

  // 2a. Limite plan free : 10 checkpoints / asset (toutes branches).
  if (c.get('plan') === 'free') {
    const { count } = await supabase
      .from('versions').select('id', { count: 'exact', head: true }).eq('asset_id', body.asset_id);
    if ((count ?? 0) >= 10) {
      return c.json<ErrorResponse>({ error: 'Free plan limit reached (10 checkpoints). Upgrade to continue.' }, 403);
    }
  }

  // 2b. Cohérence de nœud (dg_id stable vs id Figma volatil après restore-par-clone).
  if (body.figma_node_id) {
    const { data: prevOnBranch } = await supabase
      .from('versions').select('figma_node_id, storage_path')
      .eq('asset_id', body.asset_id).eq('branch_name', body.branch_name)
      .not('figma_node_id', 'is', null).limit(1).maybeSingle();
    if (prevOnBranch?.figma_node_id && prevOnBranch.figma_node_id !== body.figma_node_id) {
      const incomingDgId = (body.snapshot_json as FigmaSnapshot).root.dg_id;
      let prevDgId: string | undefined;
      if (prevOnBranch.storage_path) prevDgId = (await downloadSnapshot(storage, prevOnBranch.storage_path))?.root.dg_id;
      if (isNodeMismatch(
        { figmaNodeId: prevOnBranch.figma_node_id, dgId: prevDgId },
        { figmaNodeId: body.figma_node_id, dgId: incomingDgId },
      )) {
        return c.json<ErrorResponse>({ error: 'Node mismatch: this branch already tracks a different Figma element.' }, 409);
      }
    }
  }

  // 3. Création atomique. Le diff (synchrone) est calculé dans computeMeta contre le prev réel.
  let pendingDelta: DeltaJSON | null = null;
  const result = await createVersionAtomic(supabase, storage, {
    assetId: body.asset_id,
    branchName: body.branch_name,
    snapshot: body.snapshot_json as FigmaSnapshot,
    renderB64: body.render_svg_b64 ?? null,
    figmaNodeId: body.figma_node_id ?? null,
    author: body.author,
    computeMeta: async (prev) => {
      if (!prev?.storage_path) return { analysisJson: null, aiSummary: null };
      const prevSnapshot = await downloadSnapshot(storage, prev.storage_path);
      if (!prevSnapshot) return { analysisJson: null, aiSummary: null };
      const delta = diffService.compareSnapshots(prevSnapshot, body.snapshot_json as FigmaSnapshot);
      if (delta.totalChanges > 0) { pendingDelta = delta; return { analysisJson: delta, aiSummary: null }; }
      return { analysisJson: delta, aiSummary: 'Aucune modification détectée.' };
    },
  });

  if (!result.ok) return c.json<ErrorResponse>({ error: result.error }, result.status);
  const { version, analysisJson } = result;

  checkpointsCreatedTotal.inc();

  // 4. Patch Note IA en arrière-plan (fire-and-forget) ; sinon email best-effort.
  if (pendingDelta) {
    void generateAndStoreSummary({
      versionId: version.id, delta: pendingDelta, authorName: body.author.name,
      branchName: body.branch_name, versionNumber: version.version_number,
      projectName: asset.name ?? 'Design Guardian', notifyEmail: body.notify_email ?? null,
    });
  } else if (body.notify_email) {
    sendCheckpointNotification({
      to: body.notify_email, authorName: body.author.name, projectName: asset.name ?? 'Design Guardian',
      branchName: body.branch_name, versionNumber: version.version_number, aiSummary: version.ai_summary,
    }).catch(() => { /* best-effort */ });
  }

  return c.json<CheckpointResponse>({ version, analysis: analysisJson, ai_summary: version.ai_summary }, 201);
});
```

Mettre à jour les imports en tête (retirer ceux des helpers supprimés, ajouter le service) :

```ts
import { createVersionAtomic, downloadSnapshot } from '../services/versioning.service.js';
```

- [ ] **Step 2 : Typecheck + tests existants**

Run: `npm run typecheck && npm run test:run`
Expected: PASS (les tests services existants restent verts ; aucun test ne dépendait des helpers locaux supprimés).

- [ ] **Step 3 : Commit**

```bash
git add backend/src/controllers/checkpoints.controller.ts
git commit -m "refactor(checkpoints): create via createVersionAtomic (race-safe) + dedup storage helpers"
```

---

## Phase C — Fiabilité du diff (matcher `dg_id → id → path`)

### Task C1 : Matcher en couches dans `DiffService`

**Files:**
- Modify: `backend/src/services/diff.service.ts:13-99`
- Modify: `backend/src/tests/diff.service.test.ts` (ajout de cas)

**Interfaces:**
- L'API publique `compareSnapshots(v1, v2): DeltaJSON` est inchangée.

- [ ] **Step 1 : Tests qui échouent (identité par dg_id)**

Ajouter dans `backend/src/tests/diff.service.test.ts` :

```ts
describe('matcher par dg_id', () => {
  const leaf = (over: Record<string, unknown>) => ({
    id: 'x', name: 'n', type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10,
    opacity: 1, fills: [], strokes: [], ...over,
  });
  const frame = (children: unknown[], dg = 'root-dg') => ({
    figmaNodeId: 'f', figmaNodeName: 'F', capturedAt: 't',
    root: { id: 'r1', dg_id: dg, name: 'F', type: 'FRAME', x: 0, y: 0, width: 100, height: 100, opacity: 1, fills: [], strokes: [], children },
  });

  it('reconnaît un nœud renommé par dg_id (modified, pas add+remove)', () => {
    const svc = new (DiffService as any)();
    const v1 = frame([leaf({ id: 'a1', dg_id: 'leaf-1', name: 'Ancien', x: 0 })]);
    const v2 = frame([leaf({ id: 'a2', dg_id: 'leaf-1', name: 'Nouveau', x: 5 })]);
    const delta = svc.compareSnapshots(v1, v2);
    expect(delta.added).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
    expect(delta.modified.map((m: any) => m.nodeId)).toContain('leaf-1');
  });

  it('reste robuste au réordonnancement (dg_id stable malgré index changé)', () => {
    const svc = new (DiffService as any)();
    const v1 = frame([leaf({ dg_id: 'A', name: 'A' }), leaf({ dg_id: 'B', name: 'B' })]);
    const v2 = frame([leaf({ dg_id: 'B', name: 'B' }), leaf({ dg_id: 'A', name: 'A' })]);
    const delta = svc.compareSnapshots(v1, v2);
    expect(delta.added).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });
});
```

> Conserver l'import `DiffService` déjà présent en tête du fichier de test ; remplacer `new (DiffService as any)()` par le style d'instanciation existant si différent.

Run: `npm run test:run -- src/tests/diff.service.test.ts`
Expected: FAIL (les nœuds renommés/réordonnés ressortent en add+remove).

- [ ] **Step 2 : Implémentation du matcher en couches**

Dans `backend/src/services/diff.service.ts`, remplacer le bloc de choix de map (lignes 18-20) et les deux méthodes `flattenTree`/`flattenTreeByPath` par un flatten unique paramétré par une fonction de clé en couches :

```ts
compareSnapshots(v1: FigmaSnapshot, v2: FigmaSnapshot): DeltaJSON {
  const startTime = performance.now();

  // Matcher en couches : dg_id (stable : survit clone/rename/réordre/cross-branch)
  // → id Figma (same-branch) → chemin d'arbre (legacy sans dg_id, cross-branch cloné).
  const useDgId = !!v1.root.dg_id && !!v2.root.dg_id;
  const sameBranch = v1.root.id === v2.root.id;
  const keyOf = (node: NodeSnapshot, path: string): string => {
    if (useDgId && node.dg_id) return `dg:${node.dg_id}`;
    return sameBranch ? `id:${node.id}` : `path:${path}`;
  };
  const v1Map = this.flatten(v1.root, keyOf);
  const v2Map = this.flatten(v2.root, keyOf);
  // ... (le reste de la méthode est inchangé : removed / added / modified)
```

Et remplacer les deux anciennes méthodes par :

```ts
// Aplatit l'arbre en map clé→nœud. La clé est fournie par `keyOf` (matcher en couches).
private flatten(root: NodeSnapshot, keyOf: (node: NodeSnapshot, path: string) => string): Map<string, NodeSnapshot> {
  const map = new Map<string, NodeSnapshot>();
  const traverse = (node: NodeSnapshot, path: string): void => {
    map.set(keyOf(node, path), node);
    node.children?.forEach((child, i) => traverse(child, `${path}/${i}:${child.type}:${child.name}`));
  };
  traverse(root, `${root.type}:${root.name}`);
  return map;
}
```

> Le reste de `compareSnapshots` (boucles removed/added/modified, `nodeId: id`) reste identique : `id` est désormais la clé du matcher (ex. `dg:leaf-1`). Les tests vérifient `nodeId` = la clé dg quand dg_id est présent — comportement voulu et cohérent côté UI (identité stable).

Run: `npm run test:run -- src/tests/diff.service.test.ts`
Expected: PASS (anciens + nouveaux cas).

- [ ] **Step 3 : Typecheck + commit**

```bash
npm run typecheck
git add backend/src/services/diff.service.ts backend/src/tests/diff.service.test.ts
git commit -m "feat(diff): layered node matcher dg_id -> id -> path (robust to rename/reorder/clone)"
```

---

## Phase D — Restore explicable (diff vs head + patch note)

### Task D1 : Restore via `createVersionAtomic` + diff + AI patch note

**Files:**
- Modify: `backend/src/controllers/branches.controller.ts:244-323`
- Modify: `backend/src/types/api.ts` (ajout `restoreSchema`)

**Interfaces:**
- Consumes: `createVersionAtomic`, `resolveSnapshot`, `downloadSnapshot`, `loadOwnedVersion`, `DiffService`, `generateAndStoreSummary`.

- [ ] **Step 1 : Schéma Zod du restore**

Dans `backend/src/types/api.ts`, après `statusSchema` :

```ts
export const restoreSchema = z.object({
  branch_name: z.string().min(1).max(100),
  author: z.object({
    figma_id: z.string(),
    name: z.string(),
    avatar_url: z.string().optional(),
  }),
});
export type RestoreRequest = z.infer<typeof restoreSchema>;
```

- [ ] **Step 2 : Réécrire le handler restore**

Remplacer le handler `POST /versions/:id/restore` (lignes 244-323) par :

```ts
branchesRouter.post('/versions/:id/restore', pluginMiddleware, zValidator('json', restoreSchema), async (c) => {
  const supabase = getSupabaseClient();
  const storage = getSupabaseStorage();
  const { branch_name, author } = c.req.valid('json');

  // Charger la version source + vérifier l'ownership (garde partagé).
  const owned = await loadOwnedVersion(supabase, c.req.param('id'), c.get('projectId'));
  if ('error' in owned) {
    return owned.error === 'forbidden'
      ? c.json<ErrorResponse>({ error: 'Forbidden' }, 403)
      : c.json<ErrorResponse>({ error: 'Version not found' }, 404);
  }
  const src = owned.version as unknown as {
    asset_id: string; version_number: number; branch_name: string;
    figma_node_id: string | null; snapshot_json: FigmaSnapshot | null; storage_path: string | null;
  };

  const snapshot = await resolveSnapshot(storage, src);
  if (!snapshot) return c.json<ErrorResponse>({ error: 'Snapshot not found in storage' }, 404);

  // Création atomique sur la branche cible. Le restore est désormais EXPLICABLE :
  // on diffe l'état restauré contre le head courant de la branche cible.
  let pendingDelta: DeltaJSON | null = null;
  const result = await createVersionAtomic(supabase, storage, {
    assetId: src.asset_id,
    branchName: branch_name,
    snapshot,
    renderB64: null, // le render est copié ci-dessous si présent
    figmaNodeId: src.figma_node_id,
    author,
    computeMeta: async (prev) => {
      const baseSummary = `Restauration depuis v${src.version_number} (${src.branch_name})`;
      if (!prev?.storage_path) return { analysisJson: null, aiSummary: baseSummary };
      const headSnap = await downloadSnapshot(storage, prev.storage_path);
      if (!headSnap) return { analysisJson: null, aiSummary: baseSummary };
      const delta = diffService.compareSnapshots(headSnap, snapshot);
      if (delta.totalChanges > 0) pendingDelta = delta;
      return { analysisJson: delta.totalChanges > 0 ? delta : null, aiSummary: baseSummary };
    },
  });

  if (!result.ok) return c.json<ErrorResponse>({ error: result.error }, result.status);
  const { version } = result;

  // Copier le render pixel-perfect de la source si présent.
  if (src.storage_path && version.storage_path) {
    const { data: renderData } = await storage.from(SNAPSHOTS_BUCKET).download(src.storage_path.replace('.json', '_render.json'));
    if (renderData) {
      await storage.from(SNAPSHOTS_BUCKET).upload(
        version.storage_path.replace('.json', '_render.json'),
        await renderData.arrayBuffer(),
        { contentType: 'application/json', upsert: true },
      );
    }
  }

  // Patch Note IA expliquant ce que le restore a changé (fire-and-forget).
  if (pendingDelta) {
    void generateAndStoreSummary({
      versionId: version.id, delta: pendingDelta, authorName: author.name,
      branchName: branch_name, versionNumber: version.version_number, projectName: 'Design Guardian',
    });
  }

  return c.json({ version }, 201);
});
```

Mettre à jour les imports en tête de `branches.controller.ts` :

```ts
import { createVersionAtomic, resolveSnapshot, downloadSnapshot } from '../services/versioning.service.js';
import { DiffService } from '../services/diff.service.js';
import { generateAndStoreSummary } from '../services/checkpoint-ai.service.js';
import { restoreSchema } from '../types/api.js';
import type { DeltaJSON } from '../types/figma.js';
// + instance partagée :
const diffService = new DiffService();
```

Supprimer l'ancienne fonction locale `resolveSnapshot` (lignes 25-45) — désormais importée du service versioning ; adapter ses appelants (`/versions/:id`, `/versions/:id/snapshot`) pour passer `storage` en premier argument : `resolveSnapshot(getSupabaseStorage(), version)`.

- [ ] **Step 3 : Typecheck + tests**

Run: `npm run typecheck && npm run test:run`
Expected: PASS.

- [ ] **Step 4 : Commit**

```bash
git add backend/src/controllers/branches.controller.ts backend/src/types/api.ts
git commit -m "feat(restore): explainable restore (diff vs head + AI patch note) via createVersionAtomic + Zod"
```

---

## Phase E — Durcissement P1 (observabilité & prod)

### Task E1 : Métriques — label `route` borné + gauge sans fuite

**Files:**
- Modify: `backend/src/middleware/metrics.middleware.ts`

- [ ] **Step 1 : Réécrire le middleware**

Remplacer `backend/src/middleware/metrics.middleware.ts` :

```ts
import type { Context, Next } from 'hono';
import { httpRequestsTotal, httpRequestDuration, activeConnections } from '../services/metrics.service.js';

export async function metricsMiddleware(c: Context, next: Next): Promise<void> {
  const start = Date.now();
  activeConnections.inc();
  try {
    await next();
  } finally {
    // Pattern de route Hono (`/api/checkpoints/:id`) plutôt que le pathname concret :
    // évite l'explosion de cardinalité Prometheus (1 série par id). Fallback : pathname.
    const route = c.req.routePath ?? new URL(c.req.url).pathname;
    const method = c.req.method;
    const status = String(c.res.status);
    httpRequestsTotal.inc({ method, route, status });
    httpRequestDuration.observe({ method, route }, Date.now() - start);
    activeConnections.dec();
  }
}
```

> Si `c.req.routePath` n'est pas exposé dans la version de Hono installée, utiliser `c.req.matchedRoutes?.at(-1)?.path ?? new URL(c.req.url).pathname`. Vérifier dans `node_modules/hono` le champ disponible.

- [ ] **Step 2 : Typecheck + tests + commit**

```bash
npm run typecheck && npm run test:run
git add backend/src/middleware/metrics.middleware.ts
git commit -m "fix(metrics): bounded route label (no cardinality blowup) + leak-free gauge"
```

---

### Task E2 : Garde de configuration en production

**Files:**
- Modify: `backend/src/config/env.ts:33-44`

- [ ] **Step 1 : Ajouter la garde dans `loadEnv`**

Dans `backend/src/config/env.ts`, après `env = parsed.data;` et avant `return env;` :

```ts
  // Garde prod : /metrics ne doit pas être ouvert ; CORS doit être restreint.
  if (env.NODE_ENV === 'production') {
    if (!env.METRICS_TOKEN) {
      throw new Error('METRICS_TOKEN is required in production (protège /metrics)');
    }
    if (!env.CORS_ORIGINS) {
      console.warn('⚠️  CORS_ORIGINS vide en production : CORS ouvert à toutes les origines');
    }
  }
```

- [ ] **Step 2 : Typecheck + tests + commit**

```bash
npm run typecheck && npm run test:run
git add backend/src/config/env.ts
git commit -m "fix(config): require METRICS_TOKEN and warn on open CORS in production"
```

---

## Phase F — Qualité & refactor P2

### Task F1 : Client anon mémoïsé dans `authMiddleware`

**Files:**
- Modify: `backend/src/middleware/auth.middleware.ts`

- [ ] **Step 1 : Mémoïser le client anon**

Remplacer `backend/src/middleware/auth.middleware.ts` :

```ts
import type { Context, Next } from 'hono';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';
import type { AppEnv } from '../types/hono.js';
import type { ErrorResponse } from '../types/api.js';

let anonClient: SupabaseClient | null = null;
function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    const env = getEnv();
    anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  }
  return anonClient;
}

export async function authMiddleware(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const authorization = c.req.header('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return c.json<ErrorResponse>({ error: 'Missing or invalid authorization header' }, 401);
  }
  const token = authorization.replace('Bearer ', '');
  const { data: { user }, error } = await getAnonClient().auth.getUser(token);
  if (error || !user) return c.json<ErrorResponse>({ error: 'Invalid or expired token' }, 401);
  c.set('userId', user.id);
  await next();
}
```

- [ ] **Step 2 : Typecheck + tests + commit**

```bash
npm run typecheck && npm run test:run
git add backend/src/middleware/auth.middleware.ts
git commit -m "perf(auth): memoize anon Supabase client (one per process, not per request)"
```

---

### Task F2 : Tests d'intégration controller (ownership cross-tenant)

**Files:**
- Create: `backend/src/tests/checkpoints.controller.test.ts`
- Create: `backend/src/tests/branches.controller.test.ts`

**Interfaces:**
- Consumes: `createApp` (`backend/src/app.ts`), `singleRowDb` (stub), `vi.mock`.

- [ ] **Step 1 : Test cross-tenant sur la route status**

Create `backend/src/tests/branches.controller.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du client Supabase : projet courant = 'p1' ; version appartient à 'OTHER'.
vi.mock('../config/supabase.js', () => {
  const versionRow = { id: 'v1', status: 'draft', assets: { project_id: 'OTHER' } };
  const projectRow = { id: 'p1', plan: 'pro' };
  const thenable: Record<string, unknown> = {};
  Object.assign(thenable, {
    select: () => thenable, eq: () => thenable, not: () => thenable,
    order: () => thenable, limit: () => thenable,
    single: async () => ({ data: versionRow, error: null }),
    maybeSingle: async () => ({ data: projectRow, error: null }),
  });
  // plugin.middleware lit projects par api_key → renvoyer projectRow ; ownership lit la version.
  const from = (table: string) => (table === 'projects'
    ? { ...thenable, maybeSingle: async () => ({ data: projectRow, error: null }), single: async () => ({ data: projectRow, error: null }) }
    : thenable);
  return { getSupabaseClient: () => ({ from }), getSupabaseStorage: () => ({ from: () => ({}) }) };
});

import { createApp } from '../app.js';

describe('PUT /api/branches/versions/:id/status — cross-tenant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuse (403) la mise à jour du statut d\'une version d\'un autre projet', async () => {
    const app = createApp();
    const res = await app.request('/api/branches/versions/v1/status', {
      method: 'PUT',
      headers: { 'X-API-Key': 'key-of-p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    expect(res.status).toBe(403);
  });
});
```

> Le mock ci-dessus est volontairement permissif sur les chaînes ; ajuster si une route lit une forme non couverte. Le point testé : la route status renvoie **403** quand `project_id !== projectId`.

Run: `npm run test:run -- src/tests/branches.controller.test.ts`
Expected: PASS (échouerait sans le fix A1).

- [ ] **Step 2 : Test limite de plan free sur checkpoints (optionnel mais recommandé)**

Create `backend/src/tests/checkpoints.controller.test.ts` avec un mock renvoyant `plan: 'free'` et `count: 10`, vérifiant un **403** « Free plan limit reached ». (Réutiliser la structure du mock ci-dessus ; `select(..., { count, head })` doit résoudre `{ count: 10 }`.)

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/supabase.js', () => {
  const projectRow = { id: 'p1', plan: 'free' };
  const assetRow = { id: 'a1', project_id: 'p1', name: 'A' };
  const from = (table: string) => {
    if (table === 'projects') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: projectRow, error: null }) }) }) };
    if (table === 'assets')   return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: assetRow, error: null }) }) }) }) };
    // versions : compte = 10 → limite atteinte
    return { select: () => ({ eq: async () => ({ count: 10, error: null }) }) };
  };
  return { getSupabaseClient: () => ({ from }), getSupabaseStorage: () => ({ from: () => ({}) }) };
});

import { createApp } from '../app.js';

const snapshot = { figmaNodeId: 'n', figmaNodeName: 'N', capturedAt: 't',
  root: { id: 'r', name: 'N', type: 'FRAME', x: 0, y: 0, width: 1, height: 1, opacity: 1, fills: [], strokes: [] } };

describe('POST /api/checkpoints — limite plan free', () => {
  it('renvoie 403 au 11e checkpoint', async () => {
    const app = createApp();
    const res = await app.request('/api/checkpoints', {
      method: 'POST',
      headers: { 'X-API-Key': 'k', 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_id: '00000000-0000-0000-0000-000000000000', branch_name: 'main', snapshot_json: snapshot, author: { figma_id: 'f', name: 'A' } }),
    });
    expect(res.status).toBe(403);
  });
});
```

Run: `npm run test:run -- src/tests/checkpoints.controller.test.ts`
Expected: PASS.

- [ ] **Step 3 : Suite complète + couverture + commit**

```bash
npm run typecheck && npm run test:run && npm run test:coverage
git add backend/src/tests/checkpoints.controller.test.ts backend/src/tests/branches.controller.test.ts
git commit -m "test(controllers): cross-tenant ownership + free-plan limit integration tests"
```

---

## Self-Review (couverture du plan vs constats d'audit)

| Constat audit | Tâche |
|---|---|
| S1 IDOR status cross-tenant | A1 |
| S3 relais SMS / S4 relais email / S7-notif validation | A2 |
| B (race version_number) | B1 + B2 + B3 (checkpoint) + D1 (restore) |
| Diff matching fragile (dg_id sous-exploité) | C1 |
| Restore muet (pas de diff/patch note) + figma_node_id | D1 |
| B1 cardinalité Prometheus / B2 gauge leak | E1 |
| S5 CORS prod / S6 metrics token prod | E2 |
| S7 Zod restore/status | A1 (status) + D1 (restore) |
| Q1 client anon par requête | F1 |
| Q2/R3 controllers non testés | F2 |
| R2 helpers Storage dupliqués | B2 (centralisés) + B3/D1 (adoptés) |
| R1 garde ownership dupliqué | A1 (centralisé) + D1 (adopté) |

**À décider (hors code, signalé dans A2/R4) :** sort de `/sms/verify` (utilitaire de démo vs suppression) ; re-scoping éventuel de `branches.controller.ts` → `versions.controller.ts` (non inclus : risque/portée, à trancher séparément).

**Non couvert volontairement (YAGNI / hors périmètre audit) :** détection de reparenting/réordre comme changements de 1re classe dans le diff (le matcher dg_id supprime déjà les faux add/remove) ; durabilité du Patch Note si le process Railway redémarre en cours de génération (filet `regenerate` déjà présent).
