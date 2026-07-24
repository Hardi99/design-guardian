# Spec — Nettoyage webapp : retrait du flux upload-SVG mort + dashboard compte/billing

> **Date** : 2026-06-09
> **Statut** : design validé, prêt pour plan d'implémentation
> **Contexte** : la webapp Next.js est la **façade compagnon** (landing, pricing, login, dashboard, billing). Elle contient encore le flux **upload-SVG du SaaS abandonné**, qui sème la confusion (« projects vs assets ») et porte des interactions cassées (drag & drop).

---

## 1. Problème

La webapp embarque deux vestiges du concept SaaS « upload SVG » que le produit a abandonné (le diff réel se fait sur les **propriétés natives Figma**, côté **plugin**) :

- **`app/(dashboard)/projects/[id]/page.tsx`** : upload de fichiers SVG/police, comparaison de versions — via `uploadVersion` / `uploadFont` / `compareVersions`. Ces routes backend sont protégées par `X-API-Key` (plugin) ; la webapp ne les authentifie pas → flux **cassé** en plus d'être conceptuellement mort.
- **Composants** `DropZone`, `AssetCard`, `VersionCard`, `FontSpecimen` : UI de ce flux.
- **Dashboard** : tourne autour de la **création manuelle de projet** + stats assets/versions (appels cassés) + liens vers la page d'upload.

Symptômes remontés par des utilisateurs :
1. **« Quelle est la différence entre projects et assets ? »** — la webapp expose un modèle (créer projet → uploader asset → versions) qui n'existe que dans le SaaS mort ; dans le vrai produit, projets/assets sont créés **automatiquement par le plugin** depuis le fichier Figma.
2. **« Le drag & drop n'est pas cliquable »** — `DropZone` est un simple overlay de glisser (`if (!isDragging) return null`), sans handler de clic. Vestige du même flux.

→ **Cause racine unique** : le flux upload-SVG mort. Le correctif n'est pas de réparer la `DropZone`, mais de **retirer le flux** et de recentrer la webapp sur son rôle de façade.

## 2. Objectif

- Supprimer entièrement le flux upload-SVG de la webapp.
- Transformer le dashboard en **vue compte + billing** honnête (plan courant, gestion d'abonnement, installation du plugin).
- Corriger le **texte trompeur** de la page `/demo` (garder le visuel, recadrer sur le plugin Figma).

Hors scope : pont d'identité plugin↔webapp (Phase 2), affichage des vrais projets/checkpoints dans la webapp (dépend de Phase 2).

## 3. Décisions figées

| # | Décision | Choix |
|---|---|---|
| D1 | Flux upload-SVG | **Supprimé** (route + composants + méthodes apiClient + types) |
| D2 | Dashboard | **Vue compte + billing** (plan, portail Stripe, CTA plugin) |
| D3 | Méthodes/types projet de l'apiClient | **Retrait franc** (réintroduits en Phase 2 si besoin) |
| D4 | Page `/demo` | **Gardée**, visuel conservé, **texte recadré** plugin |
| D5 | Lecture du plan | **Directe via Supabase** (RLS `Users can view own profile` ✅), pas de nouvel endpoint |
| D6 | URL plugin | `https://www.figma.com/community/plugin/1621623685015334277` |

---

## 4. Changements

### 4.1 Suppression du flux mort

**Fichiers supprimés :**
- `frontend/app/(dashboard)/projects/[id]/page.tsx` (route + dossier `[id]` si vide ensuite)
- `frontend/components/DropZone.tsx`
- `frontend/components/AssetCard.tsx`
- `frontend/components/VersionCard.tsx`
- `frontend/components/FontSpecimen.tsx`

**`frontend/lib/api/client.ts` — retrait des méthodes mortes :**
`getProjects`, `getProject`, `createProject`, `deleteProject`, `getAssets`, `getBranches`, `getAsset`, `createAsset`, `getVersions`, `uploadVersion`, `compareVersions`, `updateVersionStatus`, `uploadFont`, `getFontGlyphs`.
Et les **interfaces devenues inutilisées** définies dans ce fichier : `Project`, `Asset`, `Version`, `CompareResponse`, `FontGlyph`, `FontUploadResponse`, `FontGlyphsResponse`.
**Conservé** : la classe `APIClient`, `authHeaders()`, `createCheckout()`, l'export `apiClient`. **Ajout** : `createPortalSession()` (§4.3).

> `frontend/lib/types.ts` (`AnalysisResult`) est **conservé** : encore utilisé par `/demo` et `DiffVisualizer`.
> `SVGViewer` et `DiffVisualizer` sont **conservés** : utilisés par `/demo`.
> **Avant de supprimer chaque symbole, le plan vérifiera par grep qu'aucun autre fichier ne l'importe.**

### 4.2 Dashboard → vue compte + billing

`frontend/app/(dashboard)/dashboard/page.tsx` réécrit (Client Component) :

- **Données** : `supabase.auth.getUser()` pour l'email + `supabase.from('profiles').select('plan').eq('id', user.id).single()` pour le plan (RLS autorise la lecture de son propre profil).
- **Affichage** :
  - Salutation avec l'email de l'utilisateur.
  - **Badge du plan** courant (`free` / `pro` / `team`).
  - **Bloc abonnement** :
    - si `plan === 'free'` → bouton **« Passer à Pro »** → `Link` vers `/pricing`.
    - sinon → bouton **« Gérer mon abonnement »** → `apiClient.createPortalSession()` puis `window.location.href = url`.
  - **CTA « Installer le plugin Figma »** → lien vers `https://www.figma.com/community/plugin/1621623685015334277` (`target="_blank"`, `rel="noopener noreferrer"`).
- **Conservé** : la bannière `?checkout=success` (Phase 1) — cohérente avec la vue compte.
- **Retiré** : formulaire de création de projet, liste de projets, cartes stats assets/versions.

### 4.3 apiClient — `createPortalSession`

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

### 4.4 Demo — recadrage du texte (visuel inchangé)

`frontend/app/demo/page.tsx` — on conserve `SVGViewer`/`DiffVisualizer` et l'exemple codé en dur. On corrige uniquement le **texte trompeur** :

- Sous-titre (≈ l.95-98) : « …dans les fichiers SVG » → « …dans vos designs **Figma** ».
- Bloc CTA final (≈ l.149-162) :
  - Titre « Prêt à tester avec vos **SVG** ? » → « Prêt à versionner vos designs **Figma** ? »
  - Texte « Créez un compte gratuit pour **uploader vos assets**… » → « **Installez le plugin Figma** pour capturer et comparer vos checkpoints. »
  - CTA : bouton **primaire « Installer le plugin »** → URL Figma Community (`target="_blank"`), et bouton **secondaire « Créer un compte »** → `/login` (conservé). Le bouton upload-SVG d'origine est remplacé par ces deux-là.

> Ne pas réintroduire de notion d'upload. Le diff illustré reste une vitrine du concept géométrique.

---

## 5. Découpage en composants

| Fichier | Action | Responsabilité |
|---|---|---|
| `app/(dashboard)/projects/[id]/page.tsx` | Supprimer | — |
| `components/{DropZone,AssetCard,VersionCard,FontSpecimen}.tsx` | Supprimer | — |
| `lib/api/client.ts` | Modifier | Trim méthodes/types morts + ajout `createPortalSession` |
| `app/(dashboard)/dashboard/page.tsx` | Réécrire | Vue compte + billing |
| `app/demo/page.tsx` | Modifier | Recadrage texte plugin |

`app/(dashboard)/layout.tsx` : vérifier qu'il ne référence pas la route supprimée (sinon ajuster).

## 6. Vérification (pas de runner de test webapp)

- `cd frontend && npx tsc --noEmit` → zéro erreur (aucun import mort).
- `cd frontend && npx next build` → succès ; routes attendues : plus de `/projects/[id]`, `/dashboard` et `/demo` présents.
- Contrôle manuel des liens : header/login → `/demo` OK ; dashboard ne pointe plus vers `/projects/[id]` ; « Gérer mon abonnement » → portail (plan payant) ; « Installer le plugin » → page Figma Community.

## 7. Risques & points d'attention

- **Imports résiduels** : supprimer un composant/méthode encore importé casse le build. Le plan **grep chaque symbole** avant suppression.
- **Portail Stripe pour un free user** : `/api/payments/portal` renvoie 404 sans `stripe_customer_id` — c'est pourquoi le bouton portail n'apparaît **que** pour `plan !== 'free'` (les free voient « Passer à Pro »).
- **`profiles` sans ligne** : si un utilisateur fraîchement inscrit n'a pas encore de ligne `profiles`, la lecture du plan peut renvoyer `null` → traiter comme `free` par défaut côté UI.
- **Pas de régression Phase 1** : la bannière `?checkout=success` et le flux checkout restent intacts.

## 8. Hors scope / suite

- Réconciliation du pricing (listes Pro/Team frontend ↔ backend) + reformulation « audit trail » → **tâche #3** suivante.
- OAuth ×3, rapport d'approbation, Phase 2 → roadmap.
