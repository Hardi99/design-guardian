# Pont billing ↔ identité (device-code) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lier l'utilisateur Figma (`figma.currentUser.id`) à son compte payant via un device-code (plugin initie, approbation 1-clic web), pour gater le Pro dans le plugin avec le **vrai** plan de l'utilisateur.

**Architecture :** Nouvelle table `device_links` (lien durable hashé) + service pur + `link.controller` (5 routes) + extension `pluginMiddleware` (résout le plan via `X-Link-Token`). Plugin : réducteur de polling pur + câblage double-thread (token persisté en `clientStorage` côté main, HTTP côté ui). Webapp : page `/link` d'approbation authentifiée.

**Tech Stack :** Backend HonoJS + TS strict + Vitest + `node:crypto`. Plugin Preact + Vitest. Webapp Next.js App Router + Supabase SSR.

**Spec :** `docs/superpowers/specs/2026-06-26-billing-identity-bridge-design.md`.

## Global Constraints

- TypeScript **strict, zéro `any`** (backend) ; casts structurels tolérés côté plugin (style existant). Webapp suit le style Next existant.
- **Token = bearer opaque hashé** : `link_token` = 32 octets hex, **stocké en SHA-256** (`token_hash`), livré en clair **une seule fois** via un champ éphémère `pending_token` (nullé après livraison). JAMAIS de plaintext durable, JAMAIS de localStorage (plugin = `clientStorage` ; webapp = cookies httpOnly Supabase).
- **Approbation = JWT obligatoire** → `profile_id` = utilisateur authentifié (non usurpable).
- **Double-thread Figma** : `figma.clientStorage` et `figma.currentUser` = **main thread uniquement** (`main.ts`) ; `fetch` = **ui thread** (`ui.tsx`). Le token transite par `postMessage`.
- DRY / pas de surcharge. Migrations : numérotées, transactionnelles, idempotentes, **non auto-appliquées** (MCP Supabase read-only → SQL Editor manuel).
- `npm run typecheck` + tests verts avant chaque commit. Backend depuis `backend/` (`npm run test:run`), plugin depuis `plugin/` (`npm test`).
- **Stage uniquement** les fichiers de la tâche (jamais `.devcontainer/`). Commits terminés par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

**Backend**
- Create `supabase/migrations/014_device_links.sql` — table + index + RLS.
- Create `backend/src/services/link.service.ts` — helpers PURS (code/token/hash/status).
- Create `backend/src/controllers/link.controller.ts` — 5 routes `/api/link/*`.
- Create `backend/src/tests/link.service.test.ts`, `backend/src/tests/link.controller.test.ts`.
- Modify `backend/src/app.ts` — monter `linkRouter`.
- Modify `backend/src/middleware/plugin.middleware.ts` — résoudre le plan via `X-Link-Token`.
- Modify `backend/src/types/api.ts` — schémas Zod `linkStartSchema`, `linkApproveSchema`.
- Modify `backend/src/config/env.ts` — `WEBAPP_URL` + garde prod.

**Plugin**
- Create `plugin/src/linkFlow.ts` — réducteur de polling PUR.
- Create `plugin/src/linkFlow.test.ts`.
- Modify `plugin/src/types.ts` — messages `LINK_TOKEN` (main→ui) et `LINK_PERSIST_TOKEN` (ui→main).
- Modify `plugin/src/main.ts` — lire/écrire `dg_link_token` en `clientStorage`, envoyer `LINK_TOKEN`.
- Modify `plugin/src/ui.tsx` — `X-Link-Token` dans `api()`, section « Compte », polling.

**Webapp**
- Modify `frontend/lib/api/client.ts` — `getLinkInfo`, `approveLink`.
- Create `frontend/app/link/page.tsx` — écran d'approbation.

---

## Phase A — Backend

### Task A1 : Migration 014 — table `device_links`

**Files:** Create `supabase/migrations/014_device_links.sql`

- [ ] **Step 1 : Écrire la migration**

```sql
-- Migration 014 : pont billing↔identité (device_links). Idempotent. À appliquer en SQL Editor.
BEGIN;

CREATE TABLE IF NOT EXISTS public.device_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,           -- 16 octets hex, voyage dans approve_url (non saisi)
  figma_user_id   text NOT NULL,
  figma_user_name text,
  profile_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL = en attente
  token_hash      text,                           -- SHA-256 hex du link_token ; NULL = en attente
  pending_token   text,                           -- plaintext éphémère, livré 1× puis NULL
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,           -- validité du `code` (~10 min)
  approved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_device_links_code       ON public.device_links (code);
CREATE INDEX IF NOT EXISTS idx_device_links_token_hash ON public.device_links (token_hash);
CREATE INDEX IF NOT EXISTS idx_device_links_figma_user ON public.device_links (figma_user_id);

ALTER TABLE public.device_links ENABLE ROW LEVEL SECURITY;
-- Aucune policy : accès backend service-key uniquement (deny-all pour anon/authenticated).

COMMIT;
```

- [ ] **Step 2 : Commit**

```bash
git add supabase/migrations/014_device_links.sql
git commit -m "feat(db): device_links table for billing-identity bridge"
```

---

### Task A2 : `link.service.ts` — helpers purs + tests

**Files:** Create `backend/src/services/link.service.ts`, `backend/src/tests/link.service.test.ts`

**Interfaces:**
- Produces: `newCode(): string` (32 hex chars) · `newToken(): { token: string; hash: string }` · `hashToken(token: string): string` (SHA-256 hex)
- Produces: `type LinkStatus = 'pending' | 'approved' | 'expired'`
- Produces: `linkStatus(row: { profile_id: string | null; token_hash: string | null; expires_at: string }, now: Date): LinkStatus`

- [ ] **Step 1 : Test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { newCode, newToken, hashToken, linkStatus } from '../services/link.service.js';

describe('link.service', () => {
  it('newCode = 32 hex chars', () => {
    expect(newCode()).toMatch(/^[0-9a-f]{32}$/);
  });
  it('newToken: token 64 hex + hash = sha256(token)', () => {
    const { token, hash } = newToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken(token));
  });
  it('linkStatus: approved quand profile_id + token_hash', () => {
    const r = { profile_id: 'p', token_hash: 'h', expires_at: new Date(Date.now() - 1000).toISOString() };
    expect(linkStatus(r, new Date())).toBe('approved');
  });
  it('linkStatus: expired quand non approuvé et code expiré', () => {
    const r = { profile_id: null, token_hash: null, expires_at: new Date(Date.now() - 1000).toISOString() };
    expect(linkStatus(r, new Date())).toBe('expired');
  });
  it('linkStatus: pending sinon', () => {
    const r = { profile_id: null, token_hash: null, expires_at: new Date(Date.now() + 60000).toISOString() };
    expect(linkStatus(r, new Date())).toBe('pending');
  });
});
```

Run: `npm run test:run -- src/tests/link.service.test.ts` → FAIL.

- [ ] **Step 2 : Implémentation**

```ts
import { randomBytes, createHash } from 'node:crypto';

export function newCode(): string {
  return randomBytes(16).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

export type LinkStatus = 'pending' | 'approved' | 'expired';

/** Statut d'une ligne device_links. Approuvé prime ; sinon expiré si le code a dépassé sa validité. */
export function linkStatus(
  row: { profile_id: string | null; token_hash: string | null; expires_at: string },
  now: Date,
): LinkStatus {
  if (row.profile_id && row.token_hash) return 'approved';
  if (new Date(row.expires_at).getTime() < now.getTime()) return 'expired';
  return 'pending';
}
```

Run: `npm run test:run -- src/tests/link.service.test.ts` → PASS.

- [ ] **Step 3 : Typecheck + commit**

```bash
npm run typecheck
git add backend/src/services/link.service.ts backend/src/tests/link.service.test.ts
git commit -m "feat(link): pure helpers (code/token/hash/status)"
```

---

### Task A3 : `link.controller.ts` + Zod + montage + tests d'intégration

**Files:** Create `backend/src/controllers/link.controller.ts`, `backend/src/tests/link.controller.test.ts` · Modify `backend/src/types/api.ts`, `backend/src/app.ts`

**Interfaces:**
- Consumes: `newCode`, `newToken`, `hashToken`, `linkStatus` (A2) ; `pluginMiddleware`, `authMiddleware` ; `getSupabaseClient`, `getEnv`.
- Produces: `linkRouter` (Hono) monté `/api/link`.

- [ ] **Step 1 : Schémas Zod**

Dans `backend/src/types/api.ts`, après `restoreSchema` :

```ts
// ── Pont billing↔identité (device-code) ──────────────────────────────────────
export const linkStartSchema = z.object({
  figma_user_id: z.string().min(1),
  figma_user_name: z.string().max(120).optional(),
});
export const linkApproveSchema = z.object({ code: z.string().min(1) });
```

- [ ] **Step 2 : Le contrôleur**

Create `backend/src/controllers/link.controller.ts` :

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient } from '../config/supabase.js';
import { getEnv } from '../config/env.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { newCode, newToken, hashToken, linkStatus } from '../services/link.service.js';
import { linkStartSchema, linkApproveSchema } from '../types/api.js';
import type { ErrorResponse } from '../types/api.js';

const linkRouter = new Hono();

const CODE_TTL_MS = 10 * 60 * 1000;

// Anti-abus : /start crée une ligne (coût DB) ; plafond glissant par projet (mémoire process).
const _bucket = new Map<string, { n: number; resetAt: number }>();
function rateLimited(projectId: string): boolean {
  const now = Date.now();
  const b = _bucket.get(projectId);
  if (!b || b.resetAt < now) { _bucket.set(projectId, { n: 1, resetAt: now + 3_600_000 }); return false; }
  if (b.n >= 30) return true;
  b.n++;
  return false;
}

// POST /api/link/start — le plugin demande un code (auth X-API-Key).
linkRouter.post('/start', pluginMiddleware, zValidator('json', linkStartSchema), async (c) => {
  const projectId = (c as unknown as { get: (k: string) => string }).get('projectId');
  if (rateLimited(projectId)) return c.json<ErrorResponse>({ error: 'Rate limit exceeded' }, 429);
  const { figma_user_id, figma_user_name } = c.req.valid('json');
  const code = newCode();
  const expires_at = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error } = await getSupabaseClient().from('device_links').insert({
    code, figma_user_id, figma_user_name: figma_user_name ?? null, expires_at,
  });
  if (error) return c.json<ErrorResponse>({ error: 'Failed to start link', details: error.message }, 500);

  const base = getEnv().WEBAPP_URL || '';
  return c.json({ code, approve_url: `${base}/link?code=${code}`, expires_at }, 201);
});

// GET /api/link/status?code= — le plugin poll (auth X-API-Key). Livre le token UNE fois.
linkRouter.get('/status', pluginMiddleware, async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json<ErrorResponse>({ error: 'code required' }, 400);

  const db = getSupabaseClient();
  const { data: row } = await db
    .from('device_links')
    .select('profile_id, token_hash, pending_token, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (!row) return c.json({ status: 'expired' as const });
  const status = linkStatus(row, new Date());
  if (status === 'approved' && row.pending_token) {
    await db.from('device_links').update({ pending_token: null }).eq('code', code);
    return c.json({ status, link_token: row.pending_token as string });
  }
  return c.json({ status });
});

// GET /api/link/info?code= — la webapp affiche qui demande le lien (auth JWT).
linkRouter.get('/info', authMiddleware, async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json<ErrorResponse>({ error: 'code required' }, 400);
  const { data: row } = await getSupabaseClient()
    .from('device_links').select('figma_user_name, profile_id, token_hash, expires_at').eq('code', code).maybeSingle();
  if (!row) return c.json({ status: 'expired' as const, figma_user_name: null });
  return c.json({ status: linkStatus(row, new Date()), figma_user_name: row.figma_user_name ?? null });
});

// POST /api/link/approve — la webapp confirme (auth JWT). profile_id = utilisateur authentifié.
linkRouter.post('/approve', authMiddleware, zValidator('json', linkApproveSchema), async (c) => {
  const userId = (c as unknown as { get: (k: string) => string }).get('userId');
  const { code } = c.req.valid('json');
  const db = getSupabaseClient();

  const { data: row } = await db
    .from('device_links').select('id, figma_user_id, figma_user_name, profile_id, token_hash, expires_at').eq('code', code).maybeSingle();
  if (!row) return c.json<ErrorResponse>({ error: 'Invalid code' }, 404);
  if (linkStatus(row, new Date()) === 'expired') return c.json<ErrorResponse>({ error: 'Code expired' }, 410);
  if (row.profile_id) return c.json<ErrorResponse>({ error: 'Already linked' }, 409);

  // Un seul lien actif par utilisateur Figma : révoquer les liens approuvés antérieurs.
  await db.from('device_links').delete().eq('figma_user_id', row.figma_user_id).not('token_hash', 'is', null);

  const { token, hash } = newToken();
  const { error } = await db.from('device_links').update({
    profile_id: userId, token_hash: hash, pending_token: token, approved_at: new Date().toISOString(),
  }).eq('id', row.id);
  if (error) return c.json<ErrorResponse>({ error: 'Failed to approve', details: error.message }, 500);

  return c.json({ ok: true, figma_user_name: row.figma_user_name ?? null });
});

// GET /api/link/me — le plugin vérifie son lien (auth X-Link-Token).
linkRouter.get('/me', async (c) => {
  const token = c.req.header('X-Link-Token');
  if (!token) return c.json({ linked: false, plan: 'free' });
  const db = getSupabaseClient();
  const { data: link } = await db
    .from('device_links').select('profile_id').eq('token_hash', hashToken(token)).not('profile_id', 'is', null).maybeSingle();
  if (!link?.profile_id) return c.json({ linked: false, plan: 'free' });
  const { data: profile } = await db.from('profiles').select('plan').eq('id', link.profile_id).maybeSingle();
  return c.json({ linked: true, plan: (profile?.plan as string) ?? 'free' });
});

export { linkRouter };
```

> Le revoke des liens antérieurs supprime aussi la ligne juste retrouvée si elle était déjà approuvée — mais ici elle est pending (`row.profile_id` null, vérifié au-dessus), donc `not('token_hash','is',null)` ne la touche pas. OK.

- [ ] **Step 3 : Monter le routeur**

Dans `backend/src/app.ts`, ajouter l'import et la route :

```ts
import { linkRouter } from './controllers/link.controller.js';
```
puis, à côté des autres `app.route(...)` :
```ts
  app.route('/api/link', linkRouter);
```

- [ ] **Step 4 : Tests d'intégration**

Create `backend/src/tests/link.controller.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';

// /approve exige un JWT : sans Authorization → 401 (authMiddleware), avant toute logique.
vi.mock('../config/supabase.js', () => ({
  getSupabaseClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
  getSupabaseStorage: () => ({ from: () => ({}) }),
}));

import { createApp } from '../app.js';

describe('POST /api/link/approve — auth', () => {
  it('401 sans JWT', async () => {
    const app = createApp();
    const res = await app.request('/api/link/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'x' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/link/me — sans token', () => {
  it('renvoie linked:false / plan free', async () => {
    const app = createApp();
    const res = await app.request('/api/link/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ linked: false, plan: 'free' });
  });
});
```

Run: `npm run test:run -- src/tests/link.controller.test.ts` → PASS.

- [ ] **Step 5 : Suite + typecheck + commit**

```bash
npm run typecheck && npm run test:run
git add backend/src/controllers/link.controller.ts backend/src/tests/link.controller.test.ts backend/src/types/api.ts backend/src/app.ts
git commit -m "feat(link): device-code routes (start/status/info/approve/me)"
```

---

### Task A4 : Gating — `pluginMiddleware` résout le plan via `X-Link-Token`

**Files:** Modify `backend/src/middleware/plugin.middleware.ts` · `backend/src/tests/plugin.middleware.test.ts`

**Interfaces:**
- Consumes: `hashToken` (A2). Toujours `c.set('plan', …)` ; le plan effectif = profil lié si `X-Link-Token` valide, sinon plan projet.

- [ ] **Step 1 : Test qui échoue**

Ajouter dans `backend/src/tests/plugin.middleware.test.ts` un cas où `X-Link-Token` valide remonte le plan du profil lié (mock supabase renvoyant le projet, puis le device_link→profile, puis profiles.plan='pro'). Vérifier que le contexte `plan` devient `'pro'` même si `projects.plan='free'`.

```ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';

vi.mock('../config/supabase.js', () => {
  const from = (table: string) => {
    if (table === 'projects') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', plan: 'free' }, error: null }) }) }) };
    if (table === 'device_links') return { select: () => ({ eq: () => ({ not: () => ({ maybeSingle: async () => ({ data: { profile_id: 'u1' }, error: null }) }) }) }) };
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan: 'pro' }, error: null }) }) }) }; // profiles
  };
  return { getSupabaseClient: () => ({ from }) };
});

describe('pluginMiddleware — plan via X-Link-Token', () => {
  it('override le plan projet (free) par le plan du compte lié (pro)', async () => {
    const app = new Hono();
    app.get('/t', pluginMiddleware, (c) => c.json({ plan: (c as unknown as { get: (k: string) => string }).get('plan') }));
    const res = await app.request('/t', { headers: { 'X-API-Key': 'k', 'X-Link-Token': 'tok' } });
    expect(await res.json()).toEqual({ plan: 'pro' });
  });
});
```

Run: `npm run test:run -- src/tests/plugin.middleware.test.ts` → FAIL.

- [ ] **Step 2 : Étendre le middleware**

Remplacer le corps de `pluginMiddleware` (après avoir résolu le projet) pour résoudre le plan effectif :

```ts
import type { Context, Next } from 'hono';
import { getSupabaseClient } from '../config/supabase.js';
import { hashToken } from '../services/link.service.js';
import type { ProjectEnv } from '../types/hono.js';

export async function pluginMiddleware(c: Context<ProjectEnv>, next: Next): Promise<Response | void> {
  const key = c.req.header('X-API-Key');
  if (!key) return c.json({ error: 'Missing X-API-Key header' }, 401);

  const db = getSupabaseClient();
  const { data } = await db.from('projects').select('id, plan').eq('api_key', key).maybeSingle();
  if (!data) return c.json({ error: 'Invalid API key' }, 401);

  c.set('projectId', data.id);

  // Plan effectif : si X-Link-Token valide → plan du compte lié (override) ; sinon plan projet.
  let plan = (data.plan as string) ?? 'free';
  const linkToken = c.req.header('X-Link-Token');
  if (linkToken) {
    const { data: link } = await db
      .from('device_links').select('profile_id').eq('token_hash', hashToken(linkToken)).not('profile_id', 'is', null).maybeSingle();
    if (link?.profile_id) {
      const { data: profile } = await db.from('profiles').select('plan').eq('id', link.profile_id).maybeSingle();
      if (profile?.plan) plan = profile.plan as string;
    }
  }
  c.set('plan', plan);
  await next();
}
```

Run: `npm run test:run -- src/tests/plugin.middleware.test.ts` → PASS (anciens + nouveau).

- [ ] **Step 3 : Typecheck + suite + commit**

```bash
npm run typecheck && npm run test:run
git add backend/src/middleware/plugin.middleware.ts backend/src/tests/plugin.middleware.test.ts
git commit -m "feat(gating): resolve effective plan from X-Link-Token in pluginMiddleware"
```

---

### Task A5 : `WEBAPP_URL` env + garde prod

**Files:** Modify `backend/src/config/env.ts`

- [ ] **Step 1 : Ajouter la variable**

Dans le schéma `envSchema`, après `METRICS_TOKEN` :

```ts
  METRICS_TOKEN: z.string().default(''),
  WEBAPP_URL: z.string().default(''), // base de approve_url (ex. https://app.designguardian.app)
```

Dans la garde prod de `loadEnv` (bloc `if (validated.NODE_ENV === 'production')`), ajouter :

```ts
    if (!validated.WEBAPP_URL) {
      console.warn('⚠️  WEBAPP_URL vide en production : approve_url sera relatif/cassé');
    }
```

- [ ] **Step 2 : Typecheck + tests + commit**

```bash
npm run typecheck && npm run test:run
git add backend/src/config/env.ts
git commit -m "feat(config): WEBAPP_URL for device-link approve_url"
```

---

## Phase B — Plugin

### Task B1 : `linkFlow.ts` — réducteur de polling pur + tests

**Files:** Create `plugin/src/linkFlow.ts`, `plugin/src/linkFlow.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type LinkState = { phase: 'idle' } | { phase: 'starting' } | { phase: 'awaiting'; code: string }
    | { phase: 'linked'; token: string } | { phase: 'expired' } | { phase: 'error'; message: string };
  type LinkEvent = { type: 'START' } | { type: 'STARTED'; code: string } | { type: 'POLL_APPROVED'; token: string }
    | { type: 'POLL_EXPIRED' } | { type: 'FAIL'; message: string } | { type: 'RESET' };
  linkReducer(state: LinkState, ev: LinkEvent): LinkState
  ```

- [ ] **Step 1 : Test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { linkReducer, type LinkState } from './linkFlow.js';

describe('linkReducer', () => {
  it('idle → starting → awaiting → linked', () => {
    let s: LinkState = { phase: 'idle' };
    s = linkReducer(s, { type: 'START' });          expect(s.phase).toBe('starting');
    s = linkReducer(s, { type: 'STARTED', code: 'c' }); expect(s).toEqual({ phase: 'awaiting', code: 'c' });
    s = linkReducer(s, { type: 'POLL_APPROVED', token: 't' }); expect(s).toEqual({ phase: 'linked', token: 't' });
  });
  it('awaiting → expired', () => {
    const s = linkReducer({ phase: 'awaiting', code: 'c' }, { type: 'POLL_EXPIRED' });
    expect(s.phase).toBe('expired');
  });
  it('FAIL → error ; RESET → idle', () => {
    expect(linkReducer({ phase: 'starting' }, { type: 'FAIL', message: 'x' })).toEqual({ phase: 'error', message: 'x' });
    expect(linkReducer({ phase: 'expired' }, { type: 'RESET' })).toEqual({ phase: 'idle' });
  });
});
```

Run (depuis `plugin/`): `npm test -- src/linkFlow.test.ts` → FAIL.

- [ ] **Step 2 : Implémentation**

```ts
export type LinkState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'awaiting'; code: string }
  | { phase: 'linked'; token: string }
  | { phase: 'expired' }
  | { phase: 'error'; message: string };

export type LinkEvent =
  | { type: 'START' }
  | { type: 'STARTED'; code: string }
  | { type: 'POLL_APPROVED'; token: string }
  | { type: 'POLL_EXPIRED' }
  | { type: 'FAIL'; message: string }
  | { type: 'RESET' };

export function linkReducer(state: LinkState, ev: LinkEvent): LinkState {
  switch (ev.type) {
    case 'START':         return { phase: 'starting' };
    case 'STARTED':       return { phase: 'awaiting', code: ev.code };
    case 'POLL_APPROVED': return { phase: 'linked', token: ev.token };
    case 'POLL_EXPIRED':  return { phase: 'expired' };
    case 'FAIL':          return { phase: 'error', message: ev.message };
    case 'RESET':         return { phase: 'idle' };
    default:              return state;
  }
}
```

Run: `npm test -- src/linkFlow.test.ts` → PASS.

- [ ] **Step 3 : Typecheck + commit**

```bash
npm run typecheck && npm test
git add plugin/src/linkFlow.ts plugin/src/linkFlow.test.ts
git commit -m "feat(plugin): pure link-flow polling reducer"
```

---

### Task B2 : Câblage plugin — clientStorage (main) + UI/HTTP (ui) + X-Link-Token

**Files:** Modify `plugin/src/types.ts`, `plugin/src/main.ts`, `plugin/src/ui.tsx`

**Interfaces:**
- Consumes: `linkReducer` (B1) ; messages `LINK_TOKEN` (main→ui), `LINK_PERSIST_TOKEN` (ui→main).

- [ ] **Step 1 : Types de messages**

Dans `plugin/src/types.ts`, ajouter à `MainToUI` :
```ts
  | { type: 'LINK_TOKEN'; token: string | null }
```
et à `UIToMain` :
```ts
  | { type: 'LINK_PERSIST_TOKEN'; token: string }
```

- [ ] **Step 2 : main.ts — lire/écrire le token en clientStorage**

Dans `plugin/src/main.ts`, dans le handler des messages `UIToMain` (le `switch`), ajouter :
```ts
    case 'LINK_PERSIST_TOKEN': await figma.clientStorage.setAsync('dg_link_token', msg.token); break;
```
Et au point d'initialisation (là où `FILE_INFO`/`AUTHOR_INFO` sont envoyés à l'UI), lire et envoyer le token :
```ts
    const linkToken = (await figma.clientStorage.getAsync('dg_link_token')) as string | undefined;
    figma.ui.postMessage({ type: 'LINK_TOKEN', token: linkToken ?? null });
```

- [ ] **Step 3 : ui.tsx — X-Link-Token dans `api()` + réception du token**

En tête de `plugin/src/ui.tsx`, ajouter un token de module et l'injecter dans `api()` :
```ts
let currentLinkToken: string | null = null;

async function api<T>(key: string, path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'X-API-Key': key, 'Content-Type': 'application/json',
      ...(currentLinkToken ? { 'X-Link-Token': currentLinkToken } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error: string; details?: string };
    throw new Error(body.details ? `${body.error}: ${body.details}` : body.error);
  }
  return res.json() as Promise<T>;
}
```

Dans le `switch (msg.type)` du handler de messages, ajouter le cas :
```ts
        case 'LINK_TOKEN': {
          currentLinkToken = msg.token;
          if (msg.token) {
            try {
              const me = await fetch(`${API_BASE}/api/link/me`, { headers: { 'X-Link-Token': msg.token } }).then(r => r.json()) as { plan: Plan };
              setPlan(me.plan ?? 'free');
            } catch { /* garde le plan projet */ }
          }
          break;
        }
```

- [ ] **Step 4 : ui.tsx — section « Compte » (lier le plugin)**

Ajouter un composant `AccountLink` qui utilise `linkReducer` + `useReducer`, accessible depuis l'écran d'upgrade (bouton « Lier mon compte ») :
```tsx
function AccountLink() {
  const apiKey = useAppStore(s => s.apiKey)!;
  const author = useAppStore(s => s.author);
  const setPlan = useAppStore(s => s.setPlan);
  const [state, dispatch] = useReducer(linkReducer, { phase: 'idle' });

  const start = useCallback(async () => {
    dispatch({ type: 'START' });
    try {
      const r = await api<{ code: string; approve_url: string }>(apiKey, '/api/link/start', {
        method: 'POST',
        body: JSON.stringify({ figma_user_id: author?.figma_id ?? '', figma_user_name: author?.name ?? '' }),
      });
      dispatch({ type: 'STARTED', code: r.code });
      send({ type: 'OPEN_EXTERNAL', url: r.approve_url });
    } catch (e) { dispatch({ type: 'FAIL', message: (e as Error).message }); }
  }, [apiKey, author]);

  // Polling tant qu'on est en attente.
  useEffect(() => {
    if (state.phase !== 'awaiting') return;
    const code = state.code;
    const id = setInterval(async () => {
      try {
        const r = await api<{ status: string; link_token?: string }>(apiKey, `/api/link/status?code=${code}`);
        if (r.status === 'approved' && r.link_token) {
          currentLinkToken = r.link_token;
          send({ type: 'LINK_PERSIST_TOKEN', token: r.link_token });
          dispatch({ type: 'POLL_APPROVED', token: r.link_token });
          const me = await api<{ plan: Plan }>(apiKey, '/api/link/me');
          setPlan(me.plan ?? 'free');
        } else if (r.status === 'expired') {
          dispatch({ type: 'POLL_EXPIRED' });
        }
      } catch { /* transitoire — on retente au tick suivant */ }
    }, 3000);
    return () => clearInterval(id);
  }, [state, apiKey]);

  if (state.phase === 'linked') return <p class="text-xs text-green-400">✓ Compte lié</p>;
  if (state.phase === 'awaiting') return <p class="text-xs text-gray-400">En attente d’approbation dans le navigateur…</p>;
  if (state.phase === 'expired') return <button class="btn-secondary text-xs px-3 py-1.5" onClick={() => dispatch({ type: 'RESET' })}>Code expiré — réessayer</button>;
  if (state.phase === 'error') return <button class="btn-secondary text-xs px-3 py-1.5" onClick={start}>Erreur — réessayer</button>;
  return <button class="btn-secondary text-xs px-3 py-1.5" onClick={start}>Lier mon compte</button>;
}
```

Insérer `<AccountLink />` dans l'écran d'upgrade (le bloc `showUpgrade`), sous la liste des plans (avant le `<p>Contact…`).

- [ ] **Step 5 : Typecheck + suite plugin + commit**

```bash
npm run typecheck && npm test
git add plugin/src/types.ts plugin/src/main.ts plugin/src/ui.tsx
git commit -m "feat(plugin): account-link UI + device-code polling + X-Link-Token"
```

---

## Phase C — Webapp

### Task C1 : `apiClient` + page `/link`

**Files:** Modify `frontend/lib/api/client.ts` · Create `frontend/app/link/page.tsx`

- [ ] **Step 1 : Méthodes apiClient**

Dans `frontend/lib/api/client.ts`, ajouter à la classe `APIClient` :

```ts
  async getLinkInfo(code: string): Promise<{ figma_user_name: string | null; status: string }> {
    const res = await fetch(`${this.baseURL}/api/link/info?code=${encodeURIComponent(code)}`, {
      headers: { ...(await this.authHeaders()) },
    });
    if (!res.ok) throw new Error('Lien invalide ou expiré.');
    return res.json();
  }

  async approveLink(code: string): Promise<{ ok: boolean; figma_user_name: string | null }> {
    const res = await fetch(`${this.baseURL}/api/link/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.authHeaders()) },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error('Échec de la liaison.');
    return res.json();
  }
```

- [ ] **Step 2 : Page d'approbation**

Create `frontend/app/link/page.tsx` :

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { apiClient } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

export default function LinkPage() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get('code') ?? '';
  const [figmaName, setFigmaName] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push(`/login?next=${encodeURIComponent(`/link?code=${code}`)}`); return; }
      if (!code) { setState('error'); setMessage('Code manquant.'); return; }
      try {
        const info = await apiClient.getLinkInfo(code);
        if (info.status !== 'pending') { setState('error'); setMessage('Lien déjà utilisé ou expiré.'); return; }
        setFigmaName(info.figma_user_name);
        setState('ready');
      } catch (e) { setState('error'); setMessage((e as Error).message); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async () => {
    try { await apiClient.approveLink(code); setState('done'); }
    catch (e) { setState('error'); setMessage((e as Error).message); }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <Card>
        <CardHeader><CardTitle>Lier le plugin Figma</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>}
          {state === 'ready' && (
            <>
              <p className="text-sm text-muted-foreground">
                Lier le plugin de <strong>{figmaName ?? 'cet utilisateur Figma'}</strong> à votre compte ? Vos checkpoints utiliseront votre abonnement.
              </p>
              <Button onClick={confirm}>Confirmer la liaison</Button>
            </>
          )}
          {state === 'done' && <Alert className="border-green-500/40"><AlertDescription>✓ Plugin lié. Retournez dans Figma — votre plan est actif.</AlertDescription></Alert>}
          {state === 'error' && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3 : Vérifier le build webapp + commit**

Run (depuis `frontend/`): `npm run build` (ou `npm run lint && npx tsc --noEmit` selon les scripts) → PASS.

```bash
git add frontend/lib/api/client.ts frontend/app/link/page.tsx
git commit -m "feat(web): /link approval page + apiClient link methods"
```

> Vérifier le script de vérif du frontend dans `frontend/package.json` (probablement `next build` / `next lint`). Si `/login` n'accepte pas `?next=`, adapter la redirection au param réel supporté par la page login existante (`frontend/app/(auth)/login/page.tsx`).

---

## Self-Review

**Spec coverage :** table device_links (A1) ; helpers purs (A2) ; 5 routes start/status/info/approve/me (A3) ; gating X-Link-Token (A4) ; WEBAPP_URL (A5) ; reducer (B1) ; clientStorage double-thread + UI + X-Link-Token (B2) ; page /link + apiClient (C1). ✅ Tous les §2–§11 de la spec couverts.

**Placeholders :** aucun TODO ; code complet à chaque step. Deux notes de vérification explicites (script de test plugin/frontend, param `?next=` du login) sont des points de contrôle, pas des placeholders.

**Type consistency :** `device_links` colonnes identiques entre migration (A1), controller (A3), middleware (A4). `link_token`/`token_hash`/`pending_token` cohérents. `LinkState`/`LinkEvent`/`linkReducer` (B1) consommés tels quels en B2. Messages `LINK_TOKEN`/`LINK_PERSIST_TOKEN` déclarés (B2 step 1) puis utilisés (main + ui).

**Raffinement vs spec :** la livraison-une-fois du token utilise un champ `pending_token` (plaintext éphémère, nullé après livraison) plutôt que le hack `expires_at = now()` esquissé dans la spec — nécessaire car seul le HASH est stocké durablement, donc le plaintext doit transiter une fois. Le token durable reste hashé au repos. ✅

**Action manuelle :** migration 014 à appliquer en SQL Editor (MCP read-only) ; poser `WEBAPP_URL` (backend) et `NEXT_PUBLIC_API_URL` (déjà présent) en prod.
