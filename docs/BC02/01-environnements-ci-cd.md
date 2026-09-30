# C2.1.1 + C2.1.2 — Environnements et intégration continue

> **Grille RNCP 39583** : C2.1.1 (Déploiement continu + critères qualité/perf) · C2.1.2 (Intégration continue)

---

## C2.1.1 — Environnements de déploiement et de test

### Environnement de développement

**Local** — configuration de poste développeur :

- **Éditeur** : VS Code, TypeScript Strict Mode activé (`tsconfig.json` strict: true)
- **Langages** : TypeScript 5.x (strictement typé, zéro `any`)
- **Gestion de sources** : Git + GitHub (branche principal : `master`)
- **Gestionnaire de paquets** : npm partout (backend, plugin, webapp) — `package-lock.json` commités ; la CI installe avec `npm ci`, comme Railway : les versions testées sont celles déployées
- **Runner de tests** : Vitest (configuration `.vitest.config.ts`, environnement `node`)
- **Compilateur** : `tsc --noEmit` (vérification de type, pas d'émission de fichier)
- **Serveur d'app** : HonoJS sur `@hono/node-server` (Node.js 24, `backend/.nvmrc`, port local 3001)

**Commandes standards** :
```bash
cd backend && npm ci && npm run typecheck && npm run test:coverage
cd plugin && npm ci && npm run typecheck && npm test
```

### Outils de suivi qualité et performance

**Observabilité backend** (`.github/workflows/ci.yml:34-35`, `docs/DEPLOIEMENT.md:130-156`) :

- **Prometheus** (scrape `/metrics` toutes les 30s)
- **Grafana** (dashboards provisionnés automatiquement)
- **Health checks** :
  - `/health` — Railway vérifie toutes les 30s (état BDD, version, uptime)
  - `/ping` — UptimeRobot toutes les 5min (maintient Supabase actif, anti-pause free tier)
- **Couverture de tests** : rapport HTML généré par Vitest v8 (`backend/vitest.config.ts:10`)

**Métriques surveillées** (`docs/DEPLOIEMENT.md:281-288`) :
- Latence p95 : seuil < 200ms
- CPU Railway : seuil < 70%
- Erreurs 5xx/min : seuil < 5

### Protocole de déploiement continu

**Séquence déploiement** (`docs/DEPLOIEMENT.md:132-156`) :

```
git push master
    ↓
GitHub Actions (.github/workflows/ci.yml:1-81)
    ├─ Job backend (.github/workflows/ci.yml:13-52)
    │   ├─ npm ci
    │   ├─ npm audit --omit=dev --audit-level=high (.github/workflows/ci.yml:33-34)
    │   ├─ npm run typecheck (.github/workflows/ci.yml:36-37)
    │   ├─ npm run test:coverage (.github/workflows/ci.yml:42-43)
    │   │  + Quality Gate : couverture ≥ 80% (appliquée nativement par Vitest)
    │   └─ npm run build
    │
    └─ Job plugin (.github/workflows/ci.yml:55-81)
        ├─ npm ci
        ├─ npm run typecheck (.github/workflows/ci.yml:74-75)
        ├─ npm test (.github/workflows/ci.yml:69-70)
        └─ npm run build
    ↓ (si CI vert)
Railway auto-deploy
    ├─ Build image Docker
    ├─ Deploy nouvelle instance
    ├─ Health check /health
    └─ Bascule trafic (zero downtime)
```

**Déclencheurs** (`.github/workflows/ci.yml:3-7`) :
- `push` sur `master`
- `pull_request` vers `master`

**Délai déploiement** : 2–3 minutes (build + tests + push) + ~1 min Railway.

### Critères de qualité et performance

**Quality Gate backend** (`backend/vitest.config.ts:17-22`) :

```javascript
thresholds: {
  statements: 80,
  lines: 80,
  functions: 80,
}
```

La CI échoue automatiquement si la couverture est inférieure à 80 % sur statements, lines ou functions. Aucun déploiement sans respect du seuil.

**Commentaire CI/CD** (`.github/workflows/ci.yml:31-33`) :
> « Quality Gate : le seuil ≥80% (statements/lines/functions) est appliqué nativement par Vitest (coverage.thresholds dans vitest.config.ts). Cette step échoue automatiquement si la couverture passe sous 80%. »

**Critères additionnels** :
- Typecheck : Oui (0 erreur TypeScript)
- Health check : Oui (`/health` OK dans les 30s post-deploy)
- 0 test rouge (tous les 300 tests doivent passer : 181 backend + 119 plugin)

### Environnements multiples

| Environnement | Branche | URL | Base de données |
|---|---|---|---|
| **Local** | n'importe quelle | `localhost:3001` | `.env` local (Supabase staging) |
| **CI** | toutes | — (tests uniquement) | Placeholders (variables GitHub secrets) |
| **Production** | `master` (après CI vert) | `design-guardian.up.railway.app` | Supabase PostgreSQL prod |

**Absence d'environnement staging dédié** : contrainte budget MVP. Tests CI + couverture ≥ 80 % servent de gate avant production.

---

## C2.1.2 — Intégration continue

### Protocole d'intégration continue

**Fusion de branches → CI à chaque push/PR** (`.github/workflows/ci.yml:3-7`) :

Chaque push vers `master` ou PR déclenche immédiatement :

1. **Install** (`.github/workflows/ci.yml:29-30, 71-72`)
   - Backend et plugin : `npm ci` (installation exacte du `package-lock.json`, Node 24 lu dans `backend/.nvmrc`)

2. **Audit de sécurité** (`.github/workflows/ci.yml:32-34`)
   - Backend : `npm audit --omit=dev --audit-level=high` — bloque une vulnérabilité haute ou critique dans les dépendances de production

3. **Type check** (`.github/workflows/ci.yml:36-37, 74-75`)
   - Backend : `npm run typecheck` (tsc --noEmit)
   - Plugin : `npm run typecheck`

4. **Unit tests** (`.github/workflows/ci.yml:42-43, 77-78`)
   - Backend : `npm run test:coverage` (Vitest + coverage report)
   - Plugin : `npm test` (Vitest)

5. **Coverage gate** (`.github/workflows/ci.yml:39-41`)
   - Backend seulement : Vitest échoue sous 80 % (statements/lines/functions)
   - Logs dans l'artefact coverage HTML

6. **Build** (`.github/workflows/ci.yml:51-52, 80-81`)
   - Backend : `npm run build`
   - Plugin : `npm run build`

**Secrets injectés en CI** (`.github/workflows/ci.yml:44-49`) :
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`
- Placeholders si secrets absents (tests résilients)

**Feedback CI** :
- Oui, tous les jobs passent → PR peut être mergée, Railway auto-déploie
- Non, au moins un job échoue → PR bloquée jusqu'à correction

### Gestion des dépendances avec Dependabot

**Configuration** (`.github/dependabot.yml:1-41`) :

**Backend (npm)** (`.github/dependabot.yml:5-17`)
- Écosystème : `npm`
- Répertoire : `/backend`
- Calendrier : chaque lundi
- Limite : max 5 PRs ouvertes
- Labels : `dependencies`, `backend`
- Restriction : ignore les mises à jour majeures (breaking changes, `.github/dependabot.yml:16-17`)

**Plugin (npm)** (`.github/dependabot.yml:20-31`)
- Écosystème : `npm`
- Répertoire : `/plugin`
- Calendrier : chaque lundi
- Limite : max 5 PRs ouvertes
- Labels : `dependencies`, `plugin`
- Restriction : ignore les mises à jour majeures

**GitHub Actions** (`.github/dependabot.yml:34-40`)
- Écosystème : `github-actions`
- Calendrier : chaque mois
- Labels : `dependencies`, `ci`

**Impact** : Dépendances outdated sont testées par la CI à chaque PR Dependabot ; merge uniquement si CI vert.
