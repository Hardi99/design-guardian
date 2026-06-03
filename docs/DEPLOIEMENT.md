# Manuel de déploiement — Design Guardian

> C2.4.1 — Documentation technique · dernière mise à jour : juin 2026

---

## 1. Vue d'ensemble

| Composant | Technologie | Hébergement | URL |
|-----------|-------------|-------------|-----|
| Backend API | HonoJS + Node.js | Railway | `design-guardian.up.railway.app` |
| Base de données | Supabase PostgreSQL | Supabase (managed) | Tableau de bord Supabase |
| Storage snapshots | Supabase Storage | Supabase (managed) | Bucket `snapshots` |
| Plugin Figma | Preact + Vite | Figma Community | Plugin ID `1234` |
| Monitoring | Prometheus + Grafana | Local / Railway | `monitoring/` |

**Pipeline de déploiement** : `git push master` → GitHub Actions (build + tests + typecheck) → Railway auto-deploy si CI vert.

---

## 2. Prérequis

- Compte [Railway](https://railway.app) avec projet `design-guardian` créé
- Compte [Supabase](https://supabase.com) avec projet actif
- Compte [OpenAI](https://platform.openai.com) — clé API GPT-4o-mini
- Compte [Stripe](https://stripe.com) — clés test/live + webhook configuré
- Compte [Resend](https://resend.com) — clé API emails transactionnels
- Compte [Twilio](https://twilio.com) — SID + token + numéro SMS
- Node.js ≥ 20 et Bun ≥ 1.0 installés localement

---

## 3. Variables d'environnement

### 3.1 Variables obligatoires (Railway → Settings → Variables)

| Variable | Description | Exemple |
|----------|-------------|---------|
| `SUPABASE_URL` | URL du projet Supabase | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Clé publique Supabase | `eyJhbGci...` |
| `SUPABASE_SERVICE_KEY` | Clé service role Supabase (admin) | `eyJhbGci...` |
| `OPENAI_API_KEY` | Clé API OpenAI | `sk-proj-...` |

### 3.2 Variables optionnelles (services tiers)

| Variable | Service | Défaut si absent |
|----------|---------|-----------------|
| `RESEND_API_KEY` | Emails transactionnels | Notifications désactivées |
| `RESEND_FROM` | Expéditeur email | `noreply@designguardian.app` |
| `TWILIO_ACCOUNT_SID` | SMS | SMS désactivés |
| `TWILIO_AUTH_TOKEN` | SMS | — |
| `TWILIO_FROM_NUMBER` | Numéro expéditeur SMS | — |
| `STRIPE_SECRET_KEY` | Paiements | Paiements désactivés |
| `STRIPE_WEBHOOK_SECRET` | Signature webhook Stripe | — |
| `STRIPE_PRICE_PRO_MONTHLY` | ID price Stripe Pro mensuel | — |
| `STRIPE_PRICE_PRO_YEARLY` | ID price Stripe Pro annuel | — |
| `STRIPE_PRICE_TEAM_MONTHLY` | ID price Stripe Team mensuel | — |
| `STRIPE_PRICE_TEAM_YEARLY` | ID price Stripe Team annuel | — |

### 3.3 Variables Railway automatiques

| Variable | Valeur automatique |
|----------|--------------------|
| `PORT` | Injecté par Railway (défaut : `3001`) |
| `NODE_ENV` | `production` en production |

---

## 4. Procédure de premier déploiement

### 4.1 Supabase — initialisation BDD

```bash
# 1. Créer le projet Supabase via l'interface web
# 2. Appliquer les migrations dans l'ordre (SQL Editor Supabase)
#    Les migrations se trouvent dans supabase/migrations/
#    001_init.sql → 002_... → ... → 008_storage_snapshots.sql

# 3. Créer le bucket Storage
# Dans Supabase Dashboard → Storage → New Bucket
# Nom : snapshots
# Public : false
# Taille max fichier : 50 MB

# 4. Configurer RLS (Row Level Security)
# Les politiques RLS sont dans chaque migration — vérifier qu'elles sont actives
```

### 4.2 Railway — connexion dépôt

```bash
# Via Railway Dashboard :
# 1. New Project → Deploy from GitHub repo
# 2. Sélectionner le repo → dossier racine : backend/
# 3. Ajouter toutes les variables d'env (section 3 ci-dessus)
# 4. Start Command : bun run start
# 5. Health Check Path : /health

# Railway détecte automatiquement bun et installe les dépendances
```

### 4.3 Stripe — configuration webhook

```bash
# Dans Stripe Dashboard → Developers → Webhooks
# Endpoint URL : https://design-guardian.up.railway.app/api/payments/webhook
# Événements à écouter :
#   - checkout.session.completed
#   - customer.subscription.updated
#   - customer.subscription.deleted
#   - invoice.payment_succeeded
#   - invoice.payment_failed
# Copier le Signing secret → STRIPE_WEBHOOK_SECRET dans Railway
```

### 4.4 Vérification initiale

```bash
curl https://design-guardian.up.railway.app/health
# Réponse attendue :
# {"status":"ok","version":"1.0.0","uptime_ms":...,"timestamp":"..."}

curl https://design-guardian.up.railway.app/ping
# Réponse attendue :
# {"status":"ok","db":"connected"}
```

---

## 5. Pipeline CI/CD — GitHub Actions

```
git push master
    │
    ▼
GitHub Actions (.github/workflows/ci.yml)
    │
    ├── Job backend
    │     ├── bun install
    │     ├── tsc --noEmit (typecheck)
    │     ├── bun run test:coverage
    │     ├── Quality Gate : couverture ≥ 80%
    │     └── bun run build
    │
    └── Job plugin
          ├── npm ci
          └── npm run build
    │
    ▼ (si CI vert)
Railway auto-deploy
    │
    ├── Build image Docker
    ├── Deploy nouvelle instance
    ├── Health check /health
    └── Bascule trafic (zero downtime)
```

**Secrets GitHub requis** (Settings → Secrets → Actions) :

| Secret | Utilisation |
|--------|-------------|
| `SUPABASE_URL` | Tests CI (placeholder si absent) |
| `SUPABASE_ANON_KEY` | Tests CI |
| `SUPABASE_SERVICE_KEY` | Tests CI |
| `OPENAI_API_KEY` | Tests CI |

---

## 6. Déploiements courants

### 6.1 Déploiement standard (feature / fix)

```bash
# 1. Développer sur une branche
git checkout -b fix/mon-correctif

# 2. Tester localement
cd backend && bun run test

# 3. Merger sur master
git checkout master
git merge fix/mon-correctif

# 4. Pousser → déclenche CI + auto-deploy Railway
git push origin master

# 5. Vérifier le déploiement (~2-3 min)
# Railway Dashboard → Deployments → voir le log en cours
```

### 6.2 Hotfix prioritaire (P1 < 4h)

```bash
git checkout -b hotfix/description-courte
# ... corriger le bug ...
git add <fichiers>
git commit -m "fix: description du correctif"
git push origin hotfix/description-courte

# Créer une PR sur GitHub → review → merger → Railway déploie automatiquement
# Surveiller Grafana 24h post-deploy
```

### 6.3 Déploiement plugin Figma

```bash
cd plugin

# Build
npm run build
# Génère : dist/ui.html + dist/main.js

# Test local dans Figma :
# Figma Desktop → Plugins → Development → Import plugin from manifest
# Sélectionner plugin/manifest.json

# Publication Figma Community :
# Figma Desktop → Plugins → Publish → suivre le processus de soumission
# Délai de review Figma : 3-10 jours ouvrés
```

---

## 7. Rollback

### 7.1 Rollback Railway (< 5 minutes)

```
Railway Dashboard
    → Projet design-guardian
    → Deployments
    → Cliquer sur un déploiement antérieur
    → "Redeploy"
    → Confirmer
```

Le trafic bascule instantanément. Aucune perte de données (Railway ne touche pas Supabase).

### 7.2 Rollback base de données

```bash
# Les migrations Supabase sont irréversibles par défaut.
# Avant toute migration destructive :
# 1. Exporter les données via Supabase Dashboard → Database → Backups
# 2. Appliquer la migration en staging d'abord
# 3. Si problème : restaurer depuis le backup Supabase (point-in-time recovery)

# Supabase Pro offre des backups automatiques toutes les 24h
# Rétention : 7 jours sur le plan gratuit
```

---

## 8. Monitoring post-déploiement

### 8.1 Health checks automatiques

```bash
# Railway vérifie /health toutes les 30s
# UptimeRobot vérifie /ping toutes les 5min (maintient Supabase actif)

# Vérification manuelle :
curl https://design-guardian.up.railway.app/health
curl https://design-guardian.up.railway.app/metrics  # format Prometheus
```

### 8.2 Métriques Prometheus / Grafana

```bash
# Lancer le stack de monitoring localement :
cd monitoring
docker-compose up -d

# Grafana : http://localhost:3000
# Prometheus : http://localhost:9090

# Dashboard Design Guardian : provisonné automatiquement
# (monitoring/grafana/provisioning/dashboards/design-guardian.json)
```

**Métriques surveillées en production :**

| Métrique | Seuil acceptable | Seuil critique |
|----------|-----------------|----------------|
| Latence p95 | < 200ms | > 1 000ms |
| CPU Railway | < 70% | > 90% |
| Erreurs 5xx / min | < 5 | > 20 |
| Checkpoints créés / h | — | 0 pendant 24h (alerte inactivité) |

### 8.3 Surveillance renforcée 24h post-deploy

Après chaque déploiement en production :
1. Vérifier `/health` immédiatement après le deploy
2. Surveiller le dashboard Grafana 30 min
3. Tester manuellement : capture checkpoint → diff → apply to Figma
4. Vérifier les logs Railway (`bun run start` logs)

---

## 9. Environnements

| Env | Branche | URL | BDD |
|-----|---------|-----|-----|
| **Local** | n'importe | `localhost:3001` | `.env` local |
| **CI** | toutes | — (tests uniquement) | Placeholders |
| **Production** | `master` | `design-guardian.up.railway.app` | Supabase prod |

> **Pas d'environnement staging dédié** (contrainte budget MVP). Les tests CI + coverage ≥ 80% font office de gate avant la production.

---

## 10. Contacts et escalade

| Niveau | Responsable | Délai |
|--------|-------------|-------|
| N1 — Supervision | Monitoring Grafana automatique | Immédiat |
| N2 — Correction | Hardi Tabuna (`harditabuna@gmail.com`) | < 4h (P1) |
| N3 — Infrastructure | Support Railway / Supabase | Via ticket support |
| N4 — Critique | Rollback immédiat (section 7) | < 5 min |
