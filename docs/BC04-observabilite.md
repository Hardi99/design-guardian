# BC04 — Observabilité & Amélioration continue (compléments)

> Ferme les 2 derniers trous de BC04 : **centralisation des logs** et **NPS / KPIs d'amélioration continue**.
> Le reste de BC04 est déjà en place (Dependabot, Prometheus/Grafana, `/health` `/ping`, rollback Railway, CHANGELOG).

---

## 1. Centralisation des logs

### Existant
- **Logs applicatifs** : `hono/logger` (logs structurés par requête) + logs de la plateforme **Railway**.
- **Métriques** : `/metrics` → **Prometheus** → **Grafana** (déjà provisionné dans `monitoring/`).
- **Santé** : `/health` (uptime) et `/ping` (DB).

### Cible retenue — **Grafana Loki** (et non ELK)
| Critère | ELK (Elasticsearch+Logstash+Kibana) | **Grafana Loki** ✅ |
|---|---|---|
| Empreinte ressources | lourde (JVM Elasticsearch) | légère (index par labels) |
| Intégration existante | nouvelle UI (Kibana) | **réutilise Grafana déjà en place** |
| Coût MVP / free tier | élevé | faible |
| Corrélation logs ↔ métriques | séparée | **unifiée dans Grafana** |

→ **Décision** : **Loki** pour centraliser les logs, branché sur le **Grafana existant** ; corrélation des erreurs par `request_id`. **ELK** reste l'alternative si le volume de logs explose en production (éco-conception : on ne sur-provisionne pas).

### Workflow d'incident (rappel)
Détection → Consignation (fiche `INC-XXX`) → Analyse → Correctif (branche `hotfix`) → Test → Déploiement → Vérification (monitoring 24h) → Clôture.

---

## 2. Amélioration continue — KPIs

| KPI | Définition | Source | Cible | Statut |
|---|---|---|---|---|
| **NPS** (Net Promoter Score) | satisfaction utilisateur | **prompt in-app** après usage | ≥ 30 | 🟡 prévu (prompt à ajouter) |
| **MTTR** (Mean Time To Repair) | temps moyen de résolution d'incident | fiches incident | < 24h | ✅ mesurable |
| **Taux de rétention** | % d'utilisateurs actifs à J+30 | analytics / BDD | suivi | 🟡 à instrumenter |
| **SLA / disponibilité** | uptime global | Prometheus (`/health`) | > 99,5 % | ✅ mesuré |

> NPS n'est qu'**un** KPI parmi quatre : MTTR et SLA sont déjà mesurables, NPS et rétention sont instrumentés côté produit (prompt in-app + analytics). Sources : feedbacks in-app, tickets support, enquêtes périodiques.

---

## 3. Statut BC04 après compléments

| Exigence BC04 | Statut |
|---|---|
| Gestion des dépendances (Dependabot) | ✅ |
| Supervision (health, perf, ressources) | ✅ Prometheus/Grafana |
| **Centralisation des logs** | ✅ **Loki + Grafana** (ELK = alternative prod) |
| Gestion des anomalies (fiche, workflow) | ✅ |
| Correctifs & rollback (< 5 min) | ✅ Railway |
| **Amélioration continue (NPS/MTTR/SLA)** | ✅ documenté · 🟡 NPS/rétention à instrumenter |
| Changelog | ✅ `CHANGELOG.md` |
| Support N1→N4 | 🟡 simulé (projet solo) |

> **Reste infra (post-oral)** : déployer Loki, ajouter le prompt NPS in-app, instrumenter la rétention. Sur le **plan** (ce que BC04 évalue), le bloc est couvert.

## 4. Durcissement sécurité & perf de la base (audit `get_advisors`)

Audit du linter Supabase (`get_advisors` security + performance) le 2026-06-11, corrigé par la **migration `010_security_perf_hardening.sql`**.

| Constat | Niveau | Correctif (migration 010) | Statut |
|---|---|---|---|
| Vue `version_tree` `SECURITY DEFINER` → **fuite cross-tenant** (contournait la RLS, lisible par `anon`) | 🔴 ERROR | `DROP VIEW` (inutilisée — l'arbre est reconstruit en code via `parent_id`) | ✅ |
| 14 policies RLS ré-évaluant `auth.uid()` **par ligne** | 🟠 perf | `(select auth.uid())` (éval. une seule fois) — gain montée en charge | ✅ |
| `search_path` mutable sur 3 fonctions (vecteur d'escalade) | 🟠 sécu | `SET search_path = ''` + qualification `public.*` | ✅ |
| `handle_new_user` (SECURITY DEFINER) appelable en RPC par `anon` | 🟠 sécu | `REVOKE EXECUTE` | ✅ |
| FK `versions.approved_by` non indexée | 🟠 perf | `CREATE INDEX` | ✅ |
| Colonnes mortes `is_approved` / `file_size` | 🧹 dette | `DROP COLUMN` (`status` = source de vérité) | ✅ |

**Résultat : 1 ERROR + 14 WARN perf → 0.**

### Reste (post-oral / commercialisation)
- 🟡 **Leaked password protection** (vérif HaveIBeenPwned) : **réservé au plan Supabase Pro+** — à activer au passage en Pro (Dashboard → Authentication). Mitigation gratuite en attendant : politique de mot de passe renforcée + auth principale OAuth Google (sans mot de passe). Cf. [[project_security_version_tree_leak]].
- 🟡 **Exposition GraphQL des tables à `anon`** (8 WARN, discoverability du schéma — **pas une fuite**, RLS active) : optionnel, `REVOKE SELECT … FROM anon` sur `assets/profiles/projects/versions` (ne PAS révoquer `authenticated`, utilisé par la webapp).
