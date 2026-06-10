# Status d'avancement — Design Guardian

> Pour le détail des dernières évolutions, voir `CHANGELOG.md` (≥ 1.5.0).

## BC02 — Tests & Documentation ✅ Complet

| Item | Statut |
|------|--------|
| ≈142 tests unitaires (Vitest — 79 back + 63 plugin) | ✅ |
| Cahier de recettes `docs/RECETTES.md` | ✅ |
| Pipeline CI/CD `.github/workflows/ci.yml` | ✅ |
| OpenAPI (`openapi.ts` + Swagger UI `/api/docs`) | ✅ |
| README complet (env vars, tests, deploy) | ✅ |

## BC04 — Maintenance & Exploitation ✅ Complet

| Item | Statut |
|------|--------|
| Dependabot `.github/dependabot.yml` | ✅ |
| Health check enrichi (`version`, `uptime_ms`) | ✅ |
| CHANGELOG semver | ✅ |
| Prometheus `prom-client` + `/metrics` | ✅ |
| Grafana docker-compose + dashboard provisionné | ✅ |
| Pricing page `vercel.app/pricing` | ✅ |

## Plugin ✅ Complet

| Feature | Statut |
|---------|--------|
| Snapshot natif Figma | ✅ |
| Timeline + branches (pages Figma) | ✅ |
| Diff Viewer Split/Overlay/Nodes | ✅ |
| AI Patch Note | ✅ |
| Gold status + tooltips | ✅ |
| Restore | ✅ |
| Plan badge + "Passer à Pro" | ✅ |

## Ce qui reste

| Bloc | Item | Priorité |
|------|------|----------|
| BC01 | Deck 15-20 slides | 🔴 |
| BC01 | Diagrammes architecture Mermaid/Draw.io | 🔴 |
| BC03 | Backlog MoSCoW + story points | 🔴 |
| BC03 | Vidéo Sprint Review 10-15 min | 🔴 |
| BC03 | Gantt / roadmap | 🟡 |
| Merge branches | Backlog post-soutenance | 🟢 |
