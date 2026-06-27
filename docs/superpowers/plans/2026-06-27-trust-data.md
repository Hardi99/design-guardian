# Trust-data (RGPD) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conformité RGPD sans surface destructive : pages légales (Privacy + CGU) + suppression sur demande via un module testable et un script opérateur (dry-run par défaut) qui annule Stripe, purge le Storage et supprime les données.

**Architecture :** Backend = `purge.service.ts` (logique injectable, testée) consommée par un script CLI `scripts/purge.mjs` (PAS d'endpoint HTTP). Webapp = 2 pages statiques `/privacy` + `/terms` liées depuis login/dashboard. Aucune migration DB ; sécurité = RLS own-row déjà en place (pas de REVOKE).

**Tech Stack :** Backend HonoJS + TS strict + Vitest + `@supabase/supabase-js` (service key, `auth.admin`) + Stripe. Webapp Next.js App Router.

**Spec :** `docs/superpowers/specs/2026-06-27-trust-data-design.md`.

## Global Constraints

- TypeScript **strict, zéro `any`** (backend). Webapp suit le style Next existant.
- **Aucune route HTTP de suppression** (pas d'endpoint public destructif). La suppression passe par le module + le script opérateur.
- Script `purge.mjs` : **`--dry-run` par défaut** ; ne détruit RIEN sans `--confirm`.
- **Pas de migration DB** ; **PAS** de `REVOKE SELECT ON profiles` (casserait la webapp). RLS own-row déjà en place (migration 010).
- Pages légales en **FR / RGPD**.
- `npm run typecheck` + tests verts avant commit (backend `npm run test:run` depuis `backend/` ; webapp `npm run build` depuis `frontend/`).
- **Stage uniquement** les fichiers de la tâche (jamais `.devcontainer/`). Commits terminés par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- Create `backend/src/services/purge.service.ts` — `collectProjectStoragePaths`, `purgeProjectData`, `purgeAccount` (injectable db/storage/stripe).
- Create `backend/src/tests/purge.service.test.ts`.
- Create `backend/scripts/purge.mjs` — CLI opérateur, dry-run par défaut.
- Create `frontend/app/privacy/page.tsx`, `frontend/app/terms/page.tsx`.
- Modify `frontend/app/(auth)/login/page.tsx` (liens légaux) — et le dashboard pour un lien.

---

## Task T1 : `purge.service.ts` — logique de purge + tests

**Files:** Create `backend/src/services/purge.service.ts`, `backend/src/tests/purge.service.test.ts`

**Interfaces (produites) :**
- `collectProjectStoragePaths(db, storage, projectId): Promise<string[]>`
- `purgeProjectData(db, storage, projectId): Promise<{ blobs: number }>`
- `purgeAccount(db, storage, stripe, userId): Promise<{ projects: number; blobs: number }>`

- [ ] **Step 1 : Test qui échoue**

Create `backend/src/tests/purge.service.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import { collectProjectStoragePaths, purgeProjectData, purgeAccount } from '../services/purge.service.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Storage stub : 1 asset 'a1' → branche 'main' → v1.json + v1_render.json
function storageStub() {
  const remove = vi.fn(async () => ({ error: null }));
  const list = vi.fn(async (path: string) => {
    if (path === 'a1') return { data: [{ name: 'main' }], error: null };
    if (path === 'a1/main') return { data: [{ name: 'v1.json' }, { name: 'v1_render.json' }], error: null };
    return { data: [], error: null };
  });
  return { storage: { from: () => ({ list, remove }) }, remove };
}

// DB stub paramétrable.
function dbStub(opts: { assets?: { id: string }[]; projects?: { id: string }[]; sub?: string | null }) {
  const deleteEq = vi.fn(async () => ({ error: null }));
  const deleteUser = vi.fn(async () => ({ error: null }));
  const from = (table: string) => {
    if (table === 'assets') return { select: () => ({ eq: async () => ({ data: opts.assets ?? [], error: null }) }) };
    if (table === 'projects') return {
      select: () => ({ eq: async () => ({ data: opts.projects ?? [], error: null }) }),
      delete: () => ({ eq: deleteEq }),
    };
    if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stripe_subscription_id: opts.sub ?? null }, error: null }) }) }) };
    return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
  };
  return { db: { from, auth: { admin: { deleteUser } } }, deleteEq, deleteUser };
}

describe('collectProjectStoragePaths', () => {
  it('énumère les blobs sur 2 niveaux', async () => {
    const { storage } = storageStub();
    const { db } = dbStub({ assets: [{ id: 'a1' }] });
    const paths = await collectProjectStoragePaths(db as never, storage as never, 'p1');
    expect(paths).toEqual(['a1/main/v1.json', 'a1/main/v1_render.json']);
  });
});

describe('purgeProjectData', () => {
  it('supprime les blobs PUIS la ligne projet', async () => {
    const { storage, remove } = storageStub();
    const { db, deleteEq } = dbStub({ assets: [{ id: 'a1' }] });
    const res = await purgeProjectData(db as never, storage as never, 'p1');
    expect(remove).toHaveBeenCalledWith(['a1/main/v1.json', 'a1/main/v1_render.json']);
    expect(deleteEq).toHaveBeenCalled();
    expect(res).toEqual({ blobs: 2 });
  });
});

describe('purgeAccount', () => {
  it('annule Stripe, purge le Storage, supprime l\'utilisateur', async () => {
    const { storage } = storageStub();
    const { db, deleteUser } = dbStub({ projects: [{ id: 'p1' }], assets: [{ id: 'a1' }], sub: 'sub_123' });
    const cancel = vi.fn(async () => ({}));
    const stripe = { subscriptions: { cancel } };
    const res = await purgeAccount(db as never, storage as never, stripe as never, 'u1');
    expect(cancel).toHaveBeenCalledWith('sub_123');
    expect(deleteUser).toHaveBeenCalledWith('u1');
    expect(res).toEqual({ projects: 1, blobs: 2 });
  });

  it('sans abonnement : ne tente pas d\'annulation', async () => {
    const { storage } = storageStub();
    const { db, deleteUser } = dbStub({ projects: [{ id: 'p1' }], assets: [{ id: 'a1' }], sub: null });
    const cancel = vi.fn(async () => ({}));
    await purgeAccount(db as never, storage as never, { subscriptions: { cancel } } as never, 'u1');
    expect(cancel).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });
});
```

Run (depuis `backend/`): `npm run test:run -- src/tests/purge.service.test.ts` → FAIL (module absent).

- [ ] **Step 2 : Implémentation**

Create `backend/src/services/purge.service.ts` :

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

const SNAPSHOTS_BUCKET = 'snapshots';
type StorageApi = SupabaseClient['storage'];

// Énumère les blobs Storage d'un projet : {assetId}/{branch}/<file>, sur 2 niveaux de listing.
export async function collectProjectStoragePaths(
  db: SupabaseClient, storage: StorageApi, projectId: string,
): Promise<string[]> {
  const { data: assets } = await db.from('assets').select('id').eq('project_id', projectId);
  const paths: string[] = [];
  for (const a of (assets ?? []) as { id: string }[]) {
    const { data: branches } = await storage.from(SNAPSHOTS_BUCKET).list(a.id);
    for (const branch of branches ?? []) {
      const { data: files } = await storage.from(SNAPSHOTS_BUCKET).list(`${a.id}/${branch.name}`);
      for (const f of files ?? []) paths.push(`${a.id}/${branch.name}/${f.name}`);
    }
  }
  return paths;
}

// Purge un projet : blobs Storage PUIS ligne projects (cascade SQL assets/versions). Idempotent.
export async function purgeProjectData(
  db: SupabaseClient, storage: StorageApi, projectId: string,
): Promise<{ blobs: number }> {
  const paths = await collectProjectStoragePaths(db, storage, projectId);
  if (paths.length) await storage.from(SNAPSHOTS_BUCKET).remove(paths);
  await db.from('projects').delete().eq('id', projectId);
  return { blobs: paths.length };
}

// Purge un compte : annule l'abonnement Stripe, purge le Storage des projets possédés,
// puis supprime l'utilisateur auth (cascade profil → projets → assets/versions → device_links).
export async function purgeAccount(
  db: SupabaseClient, storage: StorageApi, stripe: Stripe | null, userId: string,
): Promise<{ projects: number; blobs: number }> {
  const { data: profile } = await db.from('profiles').select('stripe_subscription_id').eq('id', userId).maybeSingle();
  const subId = (profile as { stripe_subscription_id: string | null } | null)?.stripe_subscription_id ?? null;
  if (stripe && subId) {
    try { await stripe.subscriptions.cancel(subId); } catch { /* déjà annulé/absent — best-effort */ }
  }

  const { data: projects } = await db.from('projects').select('id').eq('owner_id', userId);
  let blobs = 0;
  for (const p of (projects ?? []) as { id: string }[]) {
    const paths = await collectProjectStoragePaths(db, storage, p.id);
    if (paths.length) await storage.from(SNAPSHOTS_BUCKET).remove(paths);
    blobs += paths.length;
  }

  await db.auth.admin.deleteUser(userId);
  return { projects: (projects ?? []).length, blobs };
}
```

Run: `npm run test:run -- src/tests/purge.service.test.ts` → PASS.

- [ ] **Step 3 : Typecheck + suite + commit**

```bash
npm run typecheck && npm run test:run
git add backend/src/services/purge.service.ts backend/src/tests/purge.service.test.ts
git commit -m "feat(purge): testable account/project data purge service (storage + stripe + cascade)"
```

---

## Task T2 : `scripts/purge.mjs` — CLI opérateur (dry-run par défaut)

**Files:** Create `backend/scripts/purge.mjs`

**Interfaces:** Consomme `purge.service.js` (compilé) OU le réimplémente en JS ? → On charge le TS via `tsx`. Le script importe depuis `../src/services/purge.service.ts` exécuté par `tsx`.

- [ ] **Step 1 : Écrire le script**

Create `backend/scripts/purge.mjs` :

```js
// Script opérateur de suppression RGPD. DRY-RUN par défaut. Lancer avec tsx :
//   npx tsx scripts/purge.mjs --account <email|uuid>
//   npx tsx scripts/purge.mjs --file-key <figma_file_key>
//   npx tsx scripts/purge.mjs --project <project_id>
// Ajouter --confirm pour exécuter réellement (sinon : affichage seul, rien n'est supprimé).
import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { collectProjectStoragePaths, purgeProjectData, purgeAccount } from '../src/services/purge.service.ts';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const confirm = args.includes('--confirm');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const storage = db.storage;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const account = get('--account');
const fileKey = get('--file-key');
const projectId = get('--project');

function banner() { console.log(confirm ? '⚠️  MODE RÉEL (--confirm) — suppression effective' : '🔍 DRY-RUN (par défaut) — rien ne sera supprimé. Ajoute --confirm pour exécuter.'); }

async function resolveProjectId() {
  if (projectId) return projectId;
  if (fileKey) {
    const { data } = await db.from('projects').select('id').eq('figma_file_key', fileKey).maybeSingle();
    return data?.id;
  }
  return undefined;
}

async function main() {
  banner();
  if (account) {
    // résoudre userId depuis email ou uuid
    let userId = account.includes('@') ? undefined : account;
    if (!userId) {
      const { data } = await db.from('profiles').select('id').eq('email', account).maybeSingle();
      userId = data?.id;
    }
    if (!userId) { console.error('Compte introuvable:', account); process.exit(1); }
    const { data: projects } = await db.from('projects').select('id').eq('owner_id', userId);
    console.log(`Compte ${userId} : ${projects?.length ?? 0} projet(s) possédé(s) + profil + device_links.`);
    if (!confirm) { console.log('(dry-run) Rien supprimé.'); return; }
    const res = await purgeAccount(db, storage, stripe, userId);
    console.log('Supprimé:', res);
    return;
  }
  const pid = await resolveProjectId();
  if (!pid) { console.error('Projet introuvable (passe --project <id> ou --file-key <k>).'); process.exit(1); }
  const paths = await collectProjectStoragePaths(db, storage, pid);
  console.log(`Projet ${pid} : ${paths.length} blob(s) Storage + ligne projet (cascade assets/versions).`);
  if (!confirm) { console.log('(dry-run) Rien supprimé.'); return; }
  const res = await purgeProjectData(db, storage, pid);
  console.log('Supprimé:', res);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2 : Vérif dry-run (sanity, ne supprime rien)**

Run (depuis `backend/`): `npx tsx scripts/purge.mjs --project 00000000-0000-0000-0000-000000000000`
Expected : affiche le banner DRY-RUN + « Projet introuvable » OU « 0 blob… (dry-run) Rien supprimé ». **Aucune** suppression. (Ne PAS lancer avec `--confirm` sur de vraies données ici.)

- [ ] **Step 3 : Typecheck (le service est typé ; le script .mjs n'est pas typecheck par tsc) + commit**

```bash
npm run typecheck
git add backend/scripts/purge.mjs
git commit -m "feat(purge): operator CLI (dry-run by default) for on-request deletion"
```

> Note : `tsconfig` exclut déjà les tests ; vérifier que `scripts/` n'est pas inclus dans `tsc` (sinon l'ajouter à `exclude`). Le `.mjs` n'est pas compilé par le build applicatif.

---

## Task T3 : Pages légales `/privacy` + `/terms` + liens

**Files:** Create `frontend/app/privacy/page.tsx`, `frontend/app/terms/page.tsx` · Modify `frontend/app/(auth)/login/page.tsx`

- [ ] **Step 1 : Page Privacy**

Create `frontend/app/privacy/page.tsx` :

```tsx
export const metadata = { title: 'Politique de confidentialité — Design Guardian' };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-invert">
      <h1>Politique de confidentialité</h1>
      <p>Dernière mise à jour : 27 juin 2026.</p>

      <h2>Données traitées</h2>
      <p>Design Guardian enregistre des <strong>propriétés géométriques natives</strong> de vos éléments Figma
      (positions, dimensions, couleurs, contours, chemins vectoriels, typographie) — le « snapshot ». Nous ne
      stockons <strong>pas</strong> votre fichier Figma source ni son rendu original. L’attribution utilise
      <code> figma.currentUser</code> (identifiant, nom, avatar). Pour les comptes : email, plan d’abonnement et
      identifiants de facturation Stripe.</p>

      <h2>Sous-traitants</h2>
      <ul>
        <li>Supabase — base de données et stockage (région UE)</li>
        <li>OpenAI — génération du résumé de changements (données minimisées : delta synthétique)</li>
        <li>Stripe — paiement et abonnements</li>
        <li>Resend — emails transactionnels ; Twilio — SMS de vérification</li>
      </ul>

      <h2>Finalités et base légale</h2>
      <p>Exécution du service de versioning (contrat), facturation (contrat), notifications (intérêt légitime ou
      consentement). Vos designs restent votre propriété.</p>

      <h2>Conservation</h2>
      <p>Les données sont conservées tant que votre compte ou votre projet existe, puis supprimées sur demande.</p>

      <h2>Vos droits (RGPD)</h2>
      <p>Vous disposez des droits d’accès, de rectification, d’<strong>effacement</strong>, de portabilité et
      d’opposition. La suppression (compte ou données d’un fichier, incluant les snapshots et le stockage associé)
      est effectuée <strong>sur demande</strong> sous 30 jours. Vos données de profil ne sont accessibles qu’à
      vous (isolation par règles de sécurité au niveau ligne).</p>

      <h2>Contact</h2>
      <p>Pour toute demande (dont l’effacement) : <a href="mailto:design-guardian@proton.me">design-guardian@proton.me</a>.</p>
    </div>
  );
}
```

- [ ] **Step 2 : Page Terms (CGU)**

Create `frontend/app/terms/page.tsx` :

```tsx
export const metadata = { title: 'Conditions générales — Design Guardian' };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-invert">
      <h1>Conditions générales d’utilisation</h1>
      <p>Dernière mise à jour : 27 juin 2026.</p>

      <h2>Objet</h2>
      <p>Design Guardian est un plugin Figma de gestion de versions (checkpoints, diff géométrique, résumé IA).</p>

      <h2>Comptes</h2>
      <p>L’accès aux fonctions payantes nécessite un compte. Vous êtes responsable de la confidentialité de vos accès.</p>

      <h2>Abonnements et paiement</h2>
      <p>Plans : Free (0 €), Pro (12 €/mois), Team (39 €/mois). Le paiement est traité par Stripe. La résiliation
      est possible à tout moment depuis le portail de facturation ; l’abonnement reste actif jusqu’à la fin de la
      période en cours.</p>

      <h2>Propriété</h2>
      <p>Vous conservez l’entière propriété de vos designs et de leurs snapshots. Nous n’acquérons aucun droit
      dessus au-delà de l’hébergement nécessaire au service.</p>

      <h2>Responsabilité</h2>
      <p>Le service est fourni « en l’état ». Nous mettons en œuvre des moyens raisonnables de disponibilité et de
      sauvegarde, sans garantie d’absence d’interruption. Notre responsabilité est limitée au montant payé sur les
      12 derniers mois.</p>

      <h2>Droit applicable</h2>
      <p>Les présentes conditions sont régies par le droit français.</p>

      <h2>Contact</h2>
      <p><a href="mailto:design-guardian@proton.me">design-guardian@proton.me</a></p>
    </div>
  );
}
```

> Si `prose`/`prose-invert` (typography plugin Tailwind) n'est pas configuré, retirer ces classes ; les balises restent lisibles. Vérifier `tailwind.config` ; sinon styliser sobrement (`space-y-4`, titres `font-semibold`).

- [ ] **Step 3 : Liens vers les pages**

Dans `frontend/app/(auth)/login/page.tsx`, ajouter sous le lien « Retour à l’accueil » (bloc final) un petit lien légal :

```tsx
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <a href="/privacy" className="hover:text-foreground">Confidentialité</a>
            {' · '}
            <a href="/terms" className="hover:text-foreground">CGU</a>
          </p>
```

> (Le dashboard peut aussi pointer dessus ; optionnel. L’essentiel : les pages existent et sont liées depuis l’entrée login, vue par tout nouvel utilisateur.)

- [ ] **Step 4 : Build + commit**

Run (depuis `frontend/`): `npm run build`
Expected : build OK, `/privacy` et `/terms` générées en statique.

```bash
git add frontend/app/privacy/page.tsx frontend/app/terms/page.tsx "frontend/app/(auth)/login/page.tsx"
git commit -m "feat(web): privacy policy + terms pages (RGPD/FR) + login links"
```

---

## Self-Review

**Spec coverage :** A docs légaux → T3 ✅ ; B suppression sur demande (service testable + script dry-run, compte + fichier/projet, purge Storage, cancel Stripe) → T1 + T2 ✅ ; C sécurité (RLS affirmée, pas de REVOKE) → documenté dans la page Privacy (« isolation par règles de sécurité au niveau ligne »), aucune migration ✅.

**Placeholders :** aucun TODO ; code/contenu complet (texte légal réel, pas un gabarit). Deux notes de vérification (prose Tailwind, scripts/ dans tsconfig) sont des points de contrôle, pas des placeholders.

**Type consistency :** `collectProjectStoragePaths`/`purgeProjectData`/`purgeAccount` mêmes signatures entre service (T1), tests (T1), script (T2). `SNAPSHOTS_BUCKET = 'snapshots'` cohérent avec le reste du code.

**Sécurité du périmètre :** aucune route HTTP destructive ajoutée ; script en dry-run par défaut ; suppression par identifiant exact (owner_id / project.id / figma_file_key) — jamais de suppression large.

**YAGNI / différés (non couverts, volontaire) :** self-serve UI, soft-delete + délai de grâce, DPA, bannière cookies, REVOKE GraphQL, table billing service-only.
