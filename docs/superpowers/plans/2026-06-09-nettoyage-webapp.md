# Nettoyage webapp (retrait flux upload-SVG + dashboard compte/billing) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirer le flux upload-SVG mort de la webapp Next.js et transformer le dashboard en vue compte + billing, sans toucher au plugin ni au backend.

**Architecture:** Suppression de la route `projects/[id]`, du hook `useProject` et de 4 composants ; nettoyage de l'`apiClient` (retrait des méthodes/types morts, ajout de `createPortalSession`) ; réécriture du dashboard en vue compte (plan lu directement via Supabase RLS, portail Stripe Phase 1, CTA plugin) ; recadrage du texte de `/demo`.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, `@supabase/ssr`, Tailwind/shadcn. **Pas de runner de test webapp** → vérification par `grep` (zéro import mort) + `npx tsc --noEmit` + `npx next build`.

**Référence spec :** `docs/superpowers/specs/2026-06-09-nettoyage-webapp-design.md`.

**Ordre des tâches** : conçu pour garder `tsc` vert à chaque commit (on ajoute avant de supprimer, on réécrit le dashboard avant de retirer les méthodes qu'il utilisait).

**Commandes de vérif :**
- Typecheck : `cd frontend && npx tsc --noEmit`
- Build : `cd frontend && npx next build`

---

## File Structure

| Fichier | Action |
|---|---|
| `frontend/lib/api/client.ts` | Modifier : +`createPortalSession`, puis retrait méthodes/types morts |
| `frontend/app/(dashboard)/dashboard/page.tsx` | Réécrire : vue compte + billing |
| `frontend/app/(dashboard)/projects/[id]/page.tsx` | Supprimer |
| `frontend/hooks/useProject.ts` | Supprimer |
| `frontend/components/{DropZone,AssetCard,VersionCard,FontSpecimen}.tsx` | Supprimer |
| `frontend/app/demo/page.tsx` | Modifier : recadrage texte |
| `frontend/lib/types.ts` | Modifier : retrait `ComparisonResult` (devenu inutilisé) |

---

## Task 1: apiClient — ajouter `createPortalSession`

**Files:**
- Modify: `frontend/lib/api/client.ts`

- [ ] **Step 1: Ajouter la méthode**

Dans la classe `APIClient`, juste après la méthode `createCheckout`, ajouter :

```ts
  async createPortalSession(): Promise<string> {
    const res = await fetch(`${this.baseURL}/api/payments/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.authHeaders()) },
      body: JSON.stringify({ return_url: `${window.location.origin}/dashboard` }),
    });
    if (!res.ok) throw new Error('Failed to open billing portal');
    const data = await res.json();
    return data.url as string;
  }
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: zéro erreur.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api/client.ts
git commit -m "feat(web): add createPortalSession to apiClient"
```

---

## Task 2: Réécrire le dashboard en vue compte + billing

**Files:**
- Modify (réécriture complète) : `frontend/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Remplacer tout le contenu du fichier**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { apiClient } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, Puzzle } from 'lucide-react';

const FIGMA_PLUGIN_URL = 'https://www.figma.com/community/plugin/1621623685015334277';

type Plan = 'free' | 'pro' | 'team';

const PLAN_LABEL: Record<Plan, string> = { free: 'Free', pro: 'Pro', team: 'Team' };

export default function DashboardPage() {
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<Plan>('free');
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      setCheckoutSuccess(true);
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setEmail(user.email ?? '');
      const { data } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .single();
      setPlan(((data as { plan?: Plan } | null)?.plan) ?? 'free');
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    setError('');
    try {
      const url = await apiClient.createPortalSession();
      window.location.href = url;
    } catch {
      setError('Impossible d’ouvrir le portail de facturation.');
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-24">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      {checkoutSuccess && (
        <Alert className="mb-6 border-green-500/40">
          <AlertDescription>
            🎉 Abonnement activé. Votre compte est maintenant {PLAN_LABEL[plan]}.
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2">Mon compte</h1>
        <p className="text-muted-foreground">{email}</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Abonnement */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Abonnement
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Plan actuel</p>
            <p className="text-2xl font-bold">{PLAN_LABEL[plan]}</p>
          </div>
          {plan === 'free' ? (
            <Button asChild>
              <Link href="/pricing">Passer à Pro</Link>
            </Button>
          ) : (
            <Button onClick={handleManageSubscription} disabled={portalLoading}>
              {portalLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Gérer mon abonnement
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Plugin */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-primary" />
            Plugin Figma
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Le versioning se fait dans Figma. Installez le plugin pour capturer vos checkpoints.
          </p>
          <Button asChild variant="outline">
            <a href={FIGMA_PLUGIN_URL} target="_blank" rel="noopener noreferrer">
              Installer
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier que `Button` supporte `asChild`**

Run: `cd frontend && npx tsc --noEmit`
Expected: zéro erreur. Si `Button` n'a pas la prop `asChild` (pattern shadcn/Radix Slot), remplacer les blocs `<Button asChild><Link .../></Button>` par un `<Link>` stylé en classes bouton, p.ex. :
`<Link href="/pricing" className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90">Passer à Pro</Link>` (idem pour le lien plugin avec `<a>`). Re-run `tsc` jusqu'à zéro erreur.

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat(web): rewrite dashboard as account + billing view"
```

---

## Task 3: Supprimer le flux upload-SVG mort

**Files:**
- Delete: `frontend/app/(dashboard)/projects/[id]/page.tsx`
- Delete: `frontend/hooks/useProject.ts`
- Delete: `frontend/components/DropZone.tsx`
- Delete: `frontend/components/AssetCard.tsx`
- Delete: `frontend/components/VersionCard.tsx`
- Delete: `frontend/components/FontSpecimen.tsx`

- [ ] **Step 1: Supprimer les fichiers**

```bash
cd "C:/Users/hardi/OneDrive/Bureau/project-M2"
git rm "frontend/app/(dashboard)/projects/[id]/page.tsx"
git rm frontend/hooks/useProject.ts
git rm frontend/components/DropZone.tsx
git rm frontend/components/AssetCard.tsx
git rm frontend/components/VersionCard.tsx
git rm frontend/components/FontSpecimen.tsx
```

Si le dossier `frontend/app/(dashboard)/projects/` devient vide, le retirer aussi : `git rm -r "frontend/app/(dashboard)/projects"` (ne s'applique que s'il ne reste rien d'autre).

- [ ] **Step 2: Vérifier qu'aucune référence ne subsiste**

Run (Grep tool ou) : `cd frontend && rg -n "useProject|DropZone|AssetCard|VersionCard|FontSpecimen|/projects/" app components lib hooks 2>$null`
Expected: aucun résultat (hors éventuels commentaires). Si un `(dashboard)/layout.tsx` ou un autre fichier référence `/projects/`, retirer la référence.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: zéro erreur. (Le dashboard réécrit en Task 2 n'utilise plus les méthodes mortes ; rien d'autre ne référence les fichiers supprimés.)

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(web): remove dead upload-SVG flow (route, hook, components)"
```

---

## Task 4: Nettoyer l'apiClient + lib/types

**Files:**
- Modify: `frontend/lib/api/client.ts`
- Modify: `frontend/lib/types.ts`

- [ ] **Step 1: Réécrire `frontend/lib/api/client.ts`**

Remplacer tout le fichier par cette version épurée (ne garde que l'auth, `createCheckout`, `createPortalSession`) :

```ts
import { createClient } from '@/lib/supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

class APIClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async createCheckout(plan: 'pro' | 'team', interval: 'monthly' | 'yearly' = 'monthly'): Promise<string> {
    const origin = window.location.origin;
    const res = await fetch(`${this.baseURL}/api/payments/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.authHeaders()) },
      body: JSON.stringify({
        plan,
        interval,
        success_url: `${origin}/dashboard?checkout=success`,
        cancel_url: `${origin}/pricing`,
      }),
    });
    if (!res.ok) throw new Error('Failed to start checkout');
    const data = await res.json();
    return data.url as string;
  }

  async createPortalSession(): Promise<string> {
    const res = await fetch(`${this.baseURL}/api/payments/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.authHeaders()) },
      body: JSON.stringify({ return_url: `${window.location.origin}/dashboard` }),
    });
    if (!res.ok) throw new Error('Failed to open billing portal');
    const data = await res.json();
    return data.url as string;
  }
}

export const apiClient = new APIClient(API_URL);
```

> Cela retire les interfaces `Project`, `Asset`, `Version`, `CompareResponse`, `FontGlyph`, `FontUploadResponse`, `FontGlyphsResponse` et l'import `AnalysisResult` (devenus inutiles).

- [ ] **Step 2: Retirer `ComparisonResult` de `frontend/lib/types.ts`**

`ComparisonResult` n'était utilisé que par `useProject` (supprimé). L'enlever de `lib/types.ts`. **Conserver** `AnalysisResult` et `Change` (utilisés par `DiffVisualizer` et `/demo`). Si après suppression un type devient orphelin, le retirer aussi ; ne PAS toucher à `AnalysisResult`/`Change`.

- [ ] **Step 3: Vérifier l'absence de références mortes**

Run: `cd frontend && rg -n "CompareResponse|FontGlyph|ComparisonResult|apiClient\.(getProjects|getProject|createProject|deleteProject|getAssets|getAsset|getBranches|createAsset|getVersions|uploadVersion|compareVersions|updateVersionStatus|uploadFont|getFontGlyphs)" app components lib 2>$null`
Expected: aucun résultat.

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: zéro erreur.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api/client.ts frontend/lib/types.ts
git commit -m "refactor(web): trim apiClient to billing only + drop dead types"
```

---

## Task 5: Recadrer le texte de `/demo` (plugin, pas upload)

**Files:**
- Modify: `frontend/app/demo/page.tsx`

- [ ] **Step 1: Corriger le sous-titre**

Remplacer le paragraphe (≈ l.95-98) :
```tsx
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Voyez comment Design Guardian détecte les changements géométriques
              dans les fichiers SVG
            </p>
```
par :
```tsx
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Voyez comment Design Guardian détecte les changements géométriques
              au pixel près dans vos designs Figma
            </p>
```

- [ ] **Step 2: Corriger le bloc CTA final**

Remplacer le bloc (≈ l.148-163) :
```tsx
              <div className="mt-12 text-center glow-border rounded-xl bg-card/50 p-8">
                <h3 className="font-display text-2xl font-bold mb-4">
                  Prêt à tester avec{' '}
                  <span className="text-gradient">vos SVG</span> ?
                </h3>
                <p className="text-muted-foreground mb-6">
                  Créez un compte gratuit pour uploader vos assets et suivre les
                  changements avec l&apos;IA
                </p>
                <Link
                  href="/login"
                  className="btn-shine inline-flex items-center gap-2 rounded-lg px-8 py-4 font-semibold text-primary-foreground shadow-glow"
                >
                  Créer un compte gratuit
                </Link>
              </div>
```
par :
```tsx
              <div className="mt-12 text-center glow-border rounded-xl bg-card/50 p-8">
                <h3 className="font-display text-2xl font-bold mb-4">
                  Prêt à versionner vos{' '}
                  <span className="text-gradient">designs Figma</span> ?
                </h3>
                <p className="text-muted-foreground mb-6">
                  Installez le plugin Figma pour capturer et comparer vos
                  checkpoints, avec l&apos;AI Patch Note.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href="https://www.figma.com/community/plugin/1621623685015334277"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-shine inline-flex items-center gap-2 rounded-lg px-8 py-4 font-semibold text-primary-foreground shadow-glow"
                  >
                    Installer le plugin
                  </a>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-8 py-4 font-semibold hover:bg-card transition-colors"
                  >
                    Créer un compte
                  </Link>
                </div>
              </div>
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: zéro erreur.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/demo/page.tsx
git commit -m "fix(web): reframe demo copy from SVG upload to Figma plugin"
```

---

## Task 6: Vérification finale (build + liens)

**Files:** aucun (validation)

- [ ] **Step 1: Build de production**

Run: `cd frontend && npx next build`
Expected: succès. La liste des routes ne contient **plus** `/projects/[id]` ; `/dashboard` et `/demo` présents.

- [ ] **Step 2: Audit des liens internes morts**

Run: `cd frontend && rg -n "/projects/" app components 2>$null`
Expected: aucun résultat (aucun lien vers la route supprimée).

- [ ] **Step 3: Vérifier les liens conservés vers /demo**

Run: `cd frontend && rg -n "/demo" app components 2>$null`
Expected: les liens existants (login, header) sont intacts et valides (la page `/demo` existe toujours).

- [ ] **Step 4: Commit (si ajustements)**

Aucun changement de code attendu ici. En cas d'ajustement, commit dédié.

---

## Definition of Done

- [ ] `cd frontend && npx tsc --noEmit` : zéro erreur.
- [ ] `cd frontend && npx next build` : succès, plus de route `/projects/[id]`.
- [ ] Aucun import/lien mort (`useProject`, `DropZone`, `AssetCard`, `VersionCard`, `FontSpecimen`, `/projects/`, méthodes apiClient retirées).
- [ ] Dashboard = vue compte + billing (plan, gérer abonnement / passer à Pro, installer le plugin), bannière `?checkout=success` conservée.
- [ ] `/demo` recadrée plugin, aucune mention d'upload SVG.
- [ ] Aucun fichier `backend/` ni `plugin/` modifié.
