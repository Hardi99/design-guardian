# C2.2.1 — Prototype + Architecture maintenable — Design Guardian

> Livrée pour la compétence RNCP 39583 C2.2.1 — « Justifier et implémenter une architecture définie; documenter et argumenter les choix technologiques et architecturaux ». Preuves : repository master (monolithe Hono 6 services, doubles workflows CI/CD, plugin Preact approuvé Figma Community mai 2026) + code réel (Service/Controller testés, 300 tests Vitest).

---

## 1. Architecture maintenable

### 1.1 Monolithe modulaire Hono — 6 domaines

Le backend Design Guardian est une **monolithe HonoJS déployée en une seule unité** sur Railway (Node.js), organisée en **6 domaines métier** prêts à extraire en microservices :

| Domaine | Responsabilité | Fichiers clés | Pattern |
|---------|---|---|---|
| **Auth** | OAuth Supabase, JWT, tokens, session | `auth.controller.ts` | REST controller (middleware JWT) |
| **BDD** | Modèle données Supabase PostgreSQL, CTE branches, migrations | Migrations `001–012`, tree traversal (`tree.service.ts`) | Supabase RLS enforced ; requêtes SQL typées |
| **Checkpoints & Diff** | Extraction snapshot, diffing géométrique (ε=0,01px), analyse delta | `diff.service.ts`, `checkpoints.controller.ts` | Fonctions pures transformant DeltaJSON |
| **Branches** | Pages dédiées `dg/<branche>`, arbre `parent_id`, navigation multi-branche | `branches.controller.ts`, `versioning.service.ts` | Controller + service métier (tree + version_number) |
| **Notifications** | Email (Resend) + SMS (Twilio), envois asynchrones | `notification.service.ts`, `notifications.controller.ts` | Fire-and-forget async ; pas de blocage API |
| **IA & Paiements** | AI Patch Note (gpt-4o-mini), Stripe webhooks signés, facturations | `checkpoint-ai.service.ts`, `openai.service.ts`, `payments.controller.ts`, `stripe.service.ts` | Service décorrélé (génération asynchrone) + webhook validator |
| **Métriques** | Prometheus `/metrics`, timers, gauges, histogrammes | `metrics.service.ts` | Prometheus client ; scrape du monitoring |

> **Trois patterns de code** : (1) **Service** = logique pure, testable (transformations, calculs) ; (2) **Controller** = orchestration HTTP, parsing/validation Zod ; (3) **Middleware** = instrumentation globale.

### 1.2 Exemples de paires Service/Controller

#### `diff.service.ts` ↔ `checkpoints.controller.ts`
- **Service** (`backend/src/services/diff.service.ts`) : logique de diffing
  - `compareSnapshots(prev, current)` : parcours arbre, détecte `removed/added/modified`, applique tolérance ε=0,01px, renvoie `DeltaJSON`.
  - `flattenTree(node, parentPath)` : aplatit le graphe Figma (IDs absolus + chemins) → Map clé `id` pour le diff.
  - Fonctions pures, testées en isolation (Vitest).
- **Controller** (`backend/src/controllers/checkpoints.controller.ts`) : réception checkpoint
  - Route `POST /api/checkpoints` : parse payload (snapshot_json, render_svg_b64, branch, author), valide schéma Zod.
  - Récupère version précédente, appelle `DiffService.compareSnapshots()`, stocke en Supabase Storage + DB.
  - Retour immédiat (réponse HTTP rapide) ; génération IA en arrière-plan (fire-and-forget).

#### `branches.controller.ts` ↔ `versioning.service.ts`
- **Service** (`versioning.service.ts`) : logique métier branches & versioning
  - `createBranchVersion(branchName, sourceAssetId)` : prépare la copie (dg_id hérité).
  - `resolveVersionTree(parentId)` : CTE PostgreSQL pour l'historique arborescent par `parent_id`.
- **Controller** (`branches.controller.ts`) : endpoints HTTP
  - `POST /api/branches` : crée page Figma + enregistre branche en DB.
  - `GET /api/branches/{id}/versions` : affiche timeline + arbre.

### 1.3 Double-thread Figma — API Figma séparée du HTTP

**Règle architecturale critique** : le plugin Figma double-thread impose une séparation stricte.

```
┌─────────────────────────────────────────────┐
│ Figma Desktop                               │
├──────────────────┬──────────────────────────┤
│ main.ts          │ ui.tsx (Webview)         │
│ (API Figma ONLY) │ (HTTP + Preact ONLY)     │
│                  │                          │
│ • figma.* API    │ • fetch() HTTPS          │
│ • exportAsync()  │ • Preact components      │
│ • node.clone()   │ • Zustand state          │
│ • figma.currentUser │ • TailwindCSS         │
│ • setPluginData  │ • Checkpoint UI          │
│                  │ • Diff viewer            │
│                  │ • Timeline / Branches    │
└──────────────────┴──────────────────────────┘
   ↕ figma.ui.postMessage / onmessage
```

**Séparation des responsabilités :**
- **main.ts** (`plugin/src/main.ts`) : extraction snapshot (parcours nœuds Figma) ; restoration par clone (`node.clone()`) ; gestion des pages/branches ; tagging `pluginData` (dg_id).
- **ui.tsx** (`plugin/src/ui.tsx`) : interface utilisateur (Preact) ; appels HTTP au backend (`fetch()` + `X-API-Key`) ; affichage diff/timeline.

**Communication** : `postMessage` avec schéma d'événements typé :
```ts
type MainMessage = 
  | { type: 'CAPTURE_SNAPSHOT'; nodeId: string; }
  | { type: 'SNAPSHOT_READY'; snapshot_json: object; render_svg_b64: string; }
  | { type: 'RESTORE_CLONE_DONE'; versionId: string; }
  | …
```

> Renvoi détaillé : **`docs/BC01/01-architecture.md` § 5** (Architecture double thread Figma).

---

## 2. Prototype fonctionnel

### 2.1 Plugin Figma approuvé Figma Community (mai 2026)

Design Guardian est un **plugin Figma officiel** publié sur Figma Community (mai 2026), signifiant :
- Audit de sécurité Figma réussi (permissions minimales, pas de `"exports"`).
- Manifest valide, performance acceptable (<3s au lancement).
- **Early adopters réels** testant le produit.

**Stack plugin :**
- **Framework** : Preact 10.x (composants légers, même API que React).
- **Build** : `create-figma-plugin` (Webpack, TypeScript strict, no `any`).
- **Style** : Tailwind CSS (classes utilitaires).
- **État** : Zustand (store global minimal) + `useReducer` (UI local, diff-viewer).

### 2.2 Fonctionnalités principales — Proof-of-concept

| Fonctionnalité | Statut | Détail | Test |
|---|---|---|---|
| **Capture checkpoint** | ✅ MVP | Snapshot JSON (propriétés natives Figma) + export SVG + auteur figma.currentUser | 119 tests plugin (dont `captureSnapshot.test.ts`) |
| **Timeline** | ✅ MVP | Historique chronologique des checkpoints, changement d'auteur, AI Patch Note asynchrone | Affichage + intégration polling |
| **Diff viewer** | ✅ MVP + **REFONTE** | Split / Overlay (mode différence) / **Nodes (liste) → remplacée par Frame-héros** (v2) | Spec `2026-06-28-diff-viewer-frame-hero-design.md` |
| **Restore** | ✅ MVP + **NOUVELLE** | Propriétés live-diff (same-branch). **NEW** : clone lossless via `node.clone()` + fallback SVG cross-branche. | Spec `2026-06-20-restore-clone-design.md` |
| **Branches** | ✅ MVP | Pages `dg/<nom>` ; copie avec `dg_id` hérité. | Intégration page + asset tracking |
| **Gold status** | ✅ MVP | Draft → Review → Approved (workflow d'approbation). | Permutations status + RLS |
| **AI Patch Note** | ✅ MVP | `gpt-4o-mini` résume les changements (FR). Génération fire-and-forget. | Backend 181 tests (dont `ai.service.test.ts`) |

### 2.3 Preuve d'itération réelle

#### Refonte Diff Viewer — Frame-héros (juin 2026)
**Avant (v0)** : deux listes parallèles
- Gauche : NodeDiffCard (cartes visuelles du changement).
- Droite : Smart Data (liste brute des propriétés modifiées).
- Résultat : redondance, bruit UI, pas de contexte spatial.

**Après (v1)** : frame surlignée + détail au clic
- **Hero = Frame visuelle**, pas une liste. L'utilisateur voit où exactement ont changé les éléments.
- **Highlights cliquables** : rectangles colorés (`modified`=violet, `added`=vert, `removed`=rouge, `derived`=gris 40%).
- **NodeDetail** : au clic, crop avant/après + propriétés lisibles (réutilise `NodeCrop` existant).
- **DiffChips** : compteurs + toggle Avant/Après en surimpression.

**Preuve** : Spec `docs/superpowers/specs/2026-06-28-diff-viewer-frame-hero-design.md` (composants `HighlightCanvas`, `NodeDetail`, `DiffChips`, dérivation des highlights, tests `buildHighlights.test.ts`).

#### Restore Lossless par Clone (juin 2026)
**Avant** : reconstruction manuelle des propriétés (risque perte de variables Figma, auto-layout dégradé).

**Après** : `node.clone()` du moteur Figma
- **Même-fichier** : clone stocké sur page dédiée `dg/_history` avec métadonnées (version id, asset id, numéro version).
- **Lossless** : variables, styles, instances, vector networks, auto-layout, prototyping préservés par Figma.
- **Zéro reconstruction** : pas besoin d'« épouse le moteur auto-layout ».
- **Fallback** : si clone élagué ou absent, repli sur SVG (zéro régression).

**Preuve** : Spec `docs/superpowers/specs/2026-06-20-restore-clone-design.md` (helpers purs `pickHistoryClone`, `framesToPrune`, main thread glue, tests `restoreClone.test.ts`).

> **Deux itérations = deux spécifications réelles** : feedback utilisateur (early adopters) → refinement → spec → implémentation. C'est le cycle agile du MVP.

---

## 3. Framework & paradigmes

### 3.1 Preact — Composants réactifs légers

**Choix** : Preact (pas React full) car
- Taille bundle : 3 KB (vs React 40 KB) → temps chargement plugin Figma critique.
- Même API React, zéro friction.
- Hooks standard (`useState`, `useReducer`, `useEffect`).

**Composants principaux** (`plugin/src/ui.tsx`) :
- `<Home />` : accueil, écoute sélection Figma.
- `<TimelineView />` : affiche checkpoints + auteur + IA résumé.
- `<DiffScreen />` : **refonte v2** : `<HighlightCanvas />` + `<NodeDetail />` + `<DiffChips />`.
- `<BranchSelector />` : dropdown branches + créer.
- `<GoldStatus />` : workflow Draft → Review → Approved.

### 3.2 Zustand — Store global typé

État partagé : **projet actif** (figma_file_key, api_key), **version sélectionnée**, **branche courante**.

```ts
// plugin/src/store.ts
interface AppState {
  project: Project | null;
  selectedVersion: Version | null;
  currentBranch: string; // 'main' ou 'dg/<nom>'
  setProject: (p: Project) => void;
  // …
}
export const useAppStore = create<AppState>(…);
```

> Pas de Redux (overkill pour un plugin) ; Zustand = juste assez.

### 3.3 useReducer — Diff viewer state machine

Le diff-viewer est un **état machine** (modes avant/après, node sélectionné, toggle dérivés) :

```ts
type DiffState = {
  selectedNodeId: string | null;
  beforeMode: boolean; // false = après
  showDerived: boolean; // affiche les nœuds portés ('minor')
};

type DiffAction =
  | { type: 'SELECT_NODE'; nodeId: string }
  | { type: 'TOGGLE_BEFORE_MODE' }
  | { type: 'TOGGLE_DERIVED' };

function diffReducer(state: DiffState, action: DiffAction): DiffState {
  switch (action.type) {
    case 'SELECT_NODE':
      return { …state, selectedNodeId: action.nodeId };
    case 'TOGGLE_BEFORE_MODE':
      return { …state, beforeMode: !state.beforeMode };
    // …
  }
}
```

> **Testable** en isolation : `diffReducer(state, action)` → `newState` (pure function).

### 3.4 Fonctions pures testées

**Exemple 1** : `buildHighlights` (spec frame-héros)
```ts
// plugin/src/diffReducer.ts
export function buildHighlights(
  nodeDiffs: NodeDiff[],
  beforeMode: boolean,
  showDerived: boolean
): Highlight[] {
  const pool = showDerived ? nodeDiffs : nodeDiffs.filter(n => n.significance !== 'minor');
  return pool.flatMap(n => {
    const bbox = beforeMode ? n.before_bbox : n.after_bbox;
    if (!bbox) return [];
    const tone = n.significance === 'minor' ? 'derived' : n.kind;
    return [{ nodeId: n.nodeId, bbox, tone }];
  });
}
```
Test : `plugin/src/diffReducer.test.ts` (entrées → highlights attendus).

**Exemple 2** : `pickHistoryClone`, `framesToPrune` (spec restore)
```ts
// plugin/src/restoreClone.ts
export function pickHistoryClone(
  frames: { id: string; data?: { dg_history_version?: string } }[],
  versionId: string
): string | undefined {
  return frames.find(f => f.data?.dg_history_version === versionId)?.id;
}

export function framesToPrune(
  frames: { …; data?: { dg_history_vnum?: number } }[],
  assetId: string,
  keepN: number
): string[] {
  // Filtre asset, trie vnum desc, garde N récents, renvoie les vieux
  …
}
```
Test : `plugin/src/restoreClone.test.ts` (match/absent, tri/élagage).

**Exemple 3** : `compareSnapshots` (diff service)
```ts
// backend/src/services/diff.service.ts
export class DiffService {
  private readonly EPSILON = 0.01; // px tolerance for geometric comparisons

  compareSnapshots(v1: FigmaSnapshot, v2: FigmaSnapshot): DeltaJSON {
    // Matcher couches : dg_id (stable) → id Figma → chemin (cross-branch)
    const keyOf = (node: NodeSnapshot, path: string): string => {
      if (node.dg_id) return `dg:${node.dg_id}`;
      return sameBranch ? `id:${node.id}` : `path:${path}`;
    };
    const v1Map = this.flatten(v1.root, keyOf);
    const v2Map = this.flatten(v2.root, keyOf);
    
    // Diff logic : removed, added, modified (with tolerance ε)
    const removed = Array.from(v1Map.values()).filter(n => !v2Map.has(keyOf(n, '')));
    const added = Array.from(v2Map.values()).filter(n => !v1Map.has(keyOf(n, '')));
    const modified = Array.from(v1Map.entries())
      .filter(([k, v1Node]) => v2Map.has(k) && this.compareNodes(v1Node, v2Map.get(k)!).length > 0)
      .map(([, v1Node]) => ({ nodeId: v1Node.id, changes: [...] }));
    
    return { removed, added, modified, metadata: { epsilon: this.EPSILON, … } };
  }

  private flatten(root: NodeSnapshot, keyOf: (n: NodeSnapshot, p: string) => string): Map<string, NodeSnapshot> {
    // Traverse tree, map key→node
  }

  private compareNodes(v1: NodeSnapshot, v2: NodeSnapshot): PropertyChange[] {
    // Compare numeric (x/y/width/height, ±ε), color fills, stroke, text, etc.
  }
}
```
Test : `backend/src/services/diff.service.test.ts` (snapshots → delta, ε=0,01px, matcher dg_id/id/path).

---

## 4. Composants d'interface — Écrans et navigation

### 4.1 Écrans principaux

| Écran | Route | Composant | Données | Navigation |
|---|---|---|---|---|
| **Home** | `/` | `<Home />` | Accueil, sélection élément | Vers Timeline |
| **Timeline** | `/timeline` | `<TimelineView />` | Checkpoints chronologiques, AI résumé | ← Home / clic checkpoint → Diff |
| **Diff Viewer** | `/diff/:versionId` | `<DiffScreen />` | Frame héros + highlights, NodeDetail | ← Timeline / ▶◀ nav versions |
| **Branches** | `/branches` | `<BranchSelector />` | Pages dg/*, checkout/create | Depuis Timeline/Diff |
| **Settings** | `/settings` | `<SettingsView />` | Clé API, connexion Supabase | Accès depuis menu |

> Détail complet : **`docs/MODE-EMPLOI-PLUGIN.md`** (1. Capturer checkpoint, 2. Créer branche, 3. Changer branche, 4. Restaurer, 5. Diff viewer, 6. Gold status, limitations connues).

### 4.2 Mode d'emploi utilisateur (extrait)

**Check-list rapide :**
1. **Capture** : sélectionne un frame → bouton **Capturer** → checkpoint + résumé IA (polling ~2s).
2. **Branche** : sélectionne frame → crée `dg/test` → nouvelle page Figma (dg_id hérité).
3. **Restore same-branch** : modifie frame → restore checkpoint → revient état capturé, editable, Ctrl+Z annule.
4. **Restore cross-branche ⭐** : capture sur main → va sur dg/test → modifie copie → restore checkpoint de main → nœud modifié **in-place** (pas SVG figé).
5. **Texte** : texte uni se restaure (contenu + couleur + police) ; texte multi-police restaure contenu mais pas style par plage (limite connue).

> Source : **`docs/MODE-EMPLOI-PLUGIN.md`** §1–6.

---

## 5. Exigences de sécurité (prototype)

### 5.1 Authentification — Supabase Auth + JWT

**Frontend (plugin ui.tsx)** :
- Supabase Auth magic link / OAuth Google → `session` (JWT + refresh token).
- Token stocké dans **`figma.clientStorage`** (persistent, par fichier Figma).
- `X-API-Key` (secret statique) envoyé en header HTTP pour chaque requête backend (garantit que les requêtes viennent du plugin, pas d'un usurpateur).

**Backend (Hono)** :
- Valide JWT signature Supabase (publique key en env var).
- Valide `X-API-Key` (secret en env var Railway).
- `authenticateRequest` middleware : rejette 401 Unauthorized.

```ts
// backend/src/controllers/versions.controller.ts
export const createCheckpoint = compose([
  authenticateRequest, // JWT valide ?
  validateApiKey,      // X-API-Key correct ?
  …
]);
```

### 5.2 Contrôle d'accès par projet — `api_key` par asset

Chaque **projet Figma** a un **`api_key`** unique (UUID) généré lors de la création. Les requêtes doivent inclure cet id pour accéder à cet asset.

```ts
// Plugin envoie : X-API-Key + project_id dans chaque POST
POST /api/checkpoints {
  project_id: "uuid-…",
  asset_id: "uuid-…",
  snapshot_json: { … },
  …
}

// Backend valide : l'utilisateur JWT owns ce project ?
const proj = await db.projects.findUnique({
  where: { id: projectId, owner_id: user.sub },
});
```

### 5.3 Token en figma.clientStorage (persistance sécurisée)

**Figma sandbox** : `figma.clientStorage` stocke JSON chiffré par Figma (clé per-file), hors du navigateur. À chaque reload du plugin :
- Récupère token de `figma.clientStorage`.
- Si expiré (refresh) → appel refresh token.
- Si invalide → re-login (magic link / OAuth).

```ts
// plugin/src/main.ts
const savedToken = await figma.clientStorage.getAsync('auth_token');
if (savedToken && isValid(savedToken)) {
  setAuthHeader(savedToken);
} else {
  // Trigger re-login UI
}
```

### 5.4 Webhooks Stripe signés

Lors du paiement (webapp), Stripe envoie webhook signé. Backend valide `sig` contre la clé webhook Stripe.

```ts
// backend/src/controllers/payments.controller.ts
export const handleStripeWebhook = async (c: Context) => {
  const sig = c.req.header('stripe-signature');
  const rawBody = await c.req.raw.text();
  const event = stripe.webhooks.constructEvent(
    rawBody, sig, STRIPE_WEBHOOK_SECRET
  );
  // traiter payment_intent.succeeded, customer.subscription.updated, etc.
};
```

### 5.5 Row-Level Security (RLS) Supabase

Toutes les tables sont protégées par RLS PostgreSQL (`figma.currentUser` → `auth.uid` → policies).

```sql
-- versions table — user can only see versions from their projects
CREATE POLICY versions_select ON versions
  FOR SELECT USING (
    asset_id IN (
      SELECT id FROM assets WHERE project_id IN (
        SELECT id FROM projects WHERE owner_id = auth.uid()
      )
    )
  );
```

> Renvoi : **`docs/BC02/04-securite-owasp.md`** (OWASP Top 10 + RLS audit).

---

## 6. Intégration & déploiement

### 6.1 CI/CD — Vitest + GitHub Actions

**300 tests** (181 backend + 119 plugin), couverture **≥ 80 %** :
- Backend : `vitest backend/src/**/*.test.ts` (tests sync + async avec fixtures Supabase).
- Plugin : `vitest plugin/src/**/*.test.ts` (tests purs : snapshot, restore, diff, UI reducers).

**Pipeline** (``.github/workflows/ci.yml``) :
1. `tsc --noEmit` (typecheck strict).
2. `vitest run` (tests + coverage gate ≥ 80 %).
3. `npm run build` (bundle frontend + plugin).
4. Deploy Railway auto (on push master).

> Source : **`docs/BC02/01-environnements-ci-cd.md`** (CI/CD, criterium qualité, perf).

### 6.2 Déploiement mono-conteneur + Figma

- **Backend** : Railway `@hono/node-server` (1 conteneur, 6 services modulaires).
- **Plugin** : Figma Community (approved, auto-update via manifest manifest URL).
- **Webapp** : Vercel (Next.js, optionnel pour le jury).

---

## Résumé — Grille C2.2.1

| Critère grille RNCP | Preuve | Statut |
|---|---|---|
| ✅ **Architecture définie & justifiée** | Monolithe modulaire Hono 6 services vs microservices (débat dans CLAUDE.md) | Spec `BC01/01-architecture.md` |
| ✅ **Séparation Service/Controller** | Diff.service ↔ versions.controller ; branches.service ↔ branches.controller | `backend/src/{services,controllers}/` |
| ✅ **Double-thread Figma** | `main.ts` (API-only) ↔ `ui.tsx` (HTTP-only) | Spec `BC01/01-architecture.md` § 5 |
| ✅ **Prototype fonctionnel** | Plugin Figma Community (mai 2026) ; 6 fonctionnalités (capture, timeline, diff, restore, branches, gold) | Figma manifest + 119 tests |
| ✅ **Itération agile réelle** | Refonte diff-viewer (spec frame-héros) + restore par clone (spec restore-clone) | Specs juin 2026 |
| ✅ **Framework & paradigmes** | Preact + Zustand + useReducer + fonctions pures | `plugin/src/ui.tsx`, reducers testés |
| ✅ **Sécurité (prototype)** | Auth Supabase + JWT + X-API-Key + RLS PostgreSQL | Tests auth + intégration Supabase |
| ✅ **Composants UI** | Home, Timeline, DiffScreen (héros frame), Branches, Settings | `docs/MODE-EMPLOI-PLUGIN.md` |
| ✅ **Exigences fonctionnelles** | Checkpoint, branche, restore same + cross, diff, gold status | Mode d'emploi + check-list |
| ✅ **Tests & qualité** | 300 tests Vitest, couverture ≥ 80 %, CI Quality Gate | `.github/workflows/ci.yml` |
