# Design Guardian - Frontend

Frontend Next.js pour Design Guardian, un SaaS de version control pour assets design avec IA.

## Stack Technique

- **Framework:** Next.js 15 (App Router)
- **Langage:** TypeScript
- **Styling:** TailwindCSS v4
- **UI Components:** Shadcn/UI (headless)
- **Auth:** Supabase Auth
- **Database:** Supabase (PostgreSQL)
- **API Client:** Custom fetch wrapper

## Structure du Projet

```
app/
├── (auth)/
│   └── login/          # Page de connexion
├── (dashboard)/
│   ├── layout.tsx      # Layout avec navigation
│   ├── dashboard/      # Dashboard principal
│   └── projects/       # Gestion des projets
├── globals.css         # Styles globaux Tailwind
├── layout.tsx          # Root layout
└── page.tsx            # Landing page

components/
├── ui/                 # Composants Shadcn/UI
├── SVGViewer.tsx       # Visualisateur SVG
└── DiffVisualizer.tsx  # Comparaison visuelle + AI

lib/
├── api/
│   └── client.ts       # Client API backend Hono
├── supabase/
│   ├── client.ts       # Client Supabase (browser)
│   └── server.ts       # Client Supabase (server)
└── utils.ts            # Utilitaires (cn, etc.)
```

## Installation

```bash
npm install
```

## Configuration

Créer un fichier `.env.local` :

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Commandes

```bash
# Développement
npm run dev

# Build production
npm run build

# Lancer en production
npm start

# Linting
npm run lint
```

## Workflow Utilisateur

### 1. Landing Page (`/`)
- Hero section avec value proposition
- 3 features principales
- CTA vers login

### 2. Authentification (`/login`)
- Sign in / Sign up avec Supabase
- Email + password
- Redirection vers dashboard

### 3. Dashboard (`/dashboard`)
- Liste des projets
- Création de nouveau projet
- Navigation rapide

### 4. Project Detail (`/projects/[id]`)
- Liste des assets du projet
- Upload nouveau asset
- Historique des versions

### 5. Asset Detail (`/assets/[id]`)
- Timeline des versions
- Upload nouvelle version
- Comparaison automatique vs version précédente

### 6. Compare View (`/compare/[v1]/[v2]`)
- Visualisation side-by-side ou overlay
- Résumé IA en français
- Détails techniques (JSON)
- Métriques (nombre de changements, temps de processing)

## Composants Principaux

### SVGViewer
Affiche un fichier SVG de manière responsive :
```tsx
<SVGViewer
  svgContent={svgString}
  label="Version 1"
/>
```

### DiffVisualizer
Compare deux SVG avec AI analysis :
```tsx
<DiffVisualizer
  svg1={v1Content}
  svg2={v2Content}
  analysis={diffResult}
  aiSummary={summary}
/>
```

## Intégration Backend

Le frontend communique avec le backend Hono via `lib/api/client.ts` :

```typescript
import { apiClient } from '@/lib/api/client';

// Récupérer les projets
const projects = await apiClient.getProjects(userId);

// Upload version
const version = await apiClient.uploadVersion(assetId, file);

// Comparer versions
const comparison = await apiClient.compareVersions(v1Id, v2Id);
```

## Routes Protégées

Toutes les routes sous `(dashboard)` sont protégées par authentication :
- Check `supabase.auth.getUser()` dans `layout.tsx`
- Redirection automatique vers `/login` si non connecté

## Responsive Design

- Mobile-first avec Tailwind
- Breakpoints : `sm:` `md:` `lg:` `xl:`
- Dark mode supporté (system preference)

## Performance

- Server Components par défaut (Next.js 15)
- Client Components marqués avec `'use client'`
- Chargement progressif des assets
- Lazy loading des composants lourds

## Déploiement

### Vercel (Recommandé)
```bash
vercel --prod
```

### Autre plateforme
```bash
npm run build
npm start
```

## TODO / Roadmap

- [ ] Middleware Supabase pour refresh token
- [ ] Page project detail avec assets
- [ ] Page asset detail avec versions timeline
- [ ] Route handler pour signout
- [ ] Pagination des listes
- [ ] Recherche/filtres
- [ ] Export des comparaisons en PDF
- [ ] Webhooks pour notifications
- [ ] Pricing page + Stripe integration

## Notes Techniques

### Supabase Auth Flow
1. User login → token stocké dans cookie
2. Middleware refresh le token automatiquement
3. Server components lisent le cookie
4. Client components utilisent `createClient()`

### Type Safety
- Tous les types API définis dans `lib/api/client.ts`
- Matching avec les types backend (`backend/src/types/`)
- Pas de `any`, strict mode TypeScript

### AI Summary Rendering
Le résumé IA est en français, généré par GPT-4o mini côté backend.
Format : 2-3 phrases expliquant les changements en langage naturel.
