# Design Guardian

> Version control & QA plugin for design teams — "Git for Figma"

Design Guardian brings the rigor of software development (Git) into the creative chaos of design. Built as a Figma plugin with a HonoJS backend, it provides geometric diff, automatic changelogs, and team approval workflows — for all Figma plan tiers.

---

## Why Design Guardian?

| | Figma Version History | Figma Branches | Design Guardian |
|---|---|---|---|
| Diff | Pixel / visual | Pixel / visual | Geometric on properties (0.01px) |
| Attribution | File author | File author | Per-node author |
| Delta | None | None | Exploitable Delta JSON |
| Branches | None (Free/Pro) | ~$45/mo/user | All plans |
| AI Changelog | No | No | Automatic via GPT-4o mini |
| QA Workflow | No | No | Draft → Review → Approved |

---

## Features

- **Checkpoint** — Snapshot Figma node properties with author attribution
- **Geometric Diff** — Compare versions at 0.01px precision on x, y, width, height, fills, opacity, vector paths
- **Branching** — Create branches from any version, no Figma Organization plan required
- **Attribution / Blame** — "Modified by X 2h ago" per node
- **AI Patch Note** — Delta JSON → readable changelog via GPT-4o mini (SVG never sent to AI)
- **Timeline** — Chronological version history with branch rails (GitKraken-inspired)
- **Diff Viewer** — Split view + overlay with opacity cursor (Kaleidoscope-inspired)
- **Smart Data** — Numeric deltas grouped by node in a side panel
- **Gold Status** — Draft → Review → Approved workflow with visual badge
- **Restore** — Non-destructive rollback: creates a new checkpoint from any past version

---

## Architecture

```
plugin/           Figma plugin — Preact + Tailwind + Vite
  src/main.ts     Main thread — Figma API only (snapshot extraction, exportAsync)
  src/ui.tsx      UI thread — Preact + HTTP calls to backend

backend/          HonoJS + TypeScript on Railway
  controllers/    checkpoints, branches, projects, assets
  services/       diff.service.ts, openai.service.ts, svg-generator.service.ts
  middleware/     plugin.middleware.ts (X-API-Key auth)

supabase/
  migrations/     PostgreSQL schema + recursive CTE branch tree
```

**Double thread** — `main.ts` has exclusive access to the Figma API. Communication with `ui.tsx` is via `postMessage` only.

**Diff engine** — Native Figma properties (`absoluteTransform`, `fills`, `vectorPaths`) extracted as `snapshot_json`. No SVG parsing for diff computation. The SVG is generated server-side for visual display only.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Plugin UI | Preact + Tailwind v4 + Vite | 3KB vs 45KB React, native ESM |
| Backend | HonoJS + TypeScript | Type-safe, fast, clean middleware |
| Hosting | Railway | Node.js unrestricted (Cloudflare Workers CPU limit incompatible with diff) |
| Diff engine | Native Figma properties | Absolute coordinates, no SVG parsing |
| AI | OpenAI GPT-4o mini | Input: Delta JSON only, never SVG |
| Auth | X-API-Key per project, auto-init via `figma.fileKey` |
| DB | Supabase PostgreSQL | Recursive CTE for branch tree |
| Storage | Supabase Storage | SVG for visual diff overlay only |

---

## Pricing

Subscription on the **website only** (Figma guidelines).

| Plan | Price | Limits |
|---|---|---|
| Free | $0 | 1 project, 10 checkpoints, 1 branch |
| Pro | $8/mo | Unlimited, full history |
| Team | $20/mo/user | Multi-user, permissions, report export |

---

## Local Development

### Plugin

```bash
cd plugin
npm install
npm run build
# Import dist/manifest.json in Figma Desktop: Plugins → Development → Import plugin from manifest
```

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY
npm run dev
```

### Database

Run migrations in order via Supabase SQL Editor:

```
supabase/migrations/001_initial.sql
supabase/migrations/002_...
...
```

---

## Project — M2 Expert en Développement Logiciel

Built as part of an M2 degree project targeting the **Expert en Développement Logiciel** title.

| Block | Weight | Key deliverables |
|---|---|---|
| BC01 Scoping | 25% | Stakeholders, feasibility, risk matrix, architecture, deck |
| BC02 Tests & Docs | 25% | Vitest 80% coverage, test book, CI/CD, OpenAPI |
| BC03 Steering | 25% | Scrum, MoSCoW backlog, KPIs, Sprint Review video |
| BC04 Maintenance | 25% | Dependabot, health checks, hotfix < 5min, semver changelog |

---

## Author

**Hardi** — [GitHub](https://github.com/Hardi99)
