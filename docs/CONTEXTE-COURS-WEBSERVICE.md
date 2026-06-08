# Second Contexte — Cours « Création d'une App complète » (Web Service)

> **Source :** `cours-react.notion.site/Creation-d-une-App-complete`
> **À utiliser EN PLUS du contexte jury BC01** (`docs/BC01/CONTEXTE-DECK-BC01.md`, grille RNCP 39583).
> Le jury évalue la **démarche** (BC01-BC04) ; ce cours définit le **produit technique** attendu (6 services + front React).

---

## 1. Objectif du cours
> « Créer un concept intégrant de l'Intelligence Artificielle et **de vendre ce service à vos utilisateurs**. »

- Architecture attendue : **6 services backend + 1 frontend React**.
- Le **service IA est le cœur** de l'app — c'est le concept vendable.
- Modèle économique obligatoire (abonnements).

---

## 2. Les 6 services requis ↔ implémentation Design Guardian

| # | Service requis (cours) | Exigences clés | Implémentation Design Guardian | Statut |
|---|---|---|---|---|
| 🔑 | **Authentification** (OAuth + OpenID) | 3 fournisseurs OAuth · JWT · OAuth2 / OIDC | **Supabase Auth** (OAuth Google + magic link) · token en `figma.clientStorage` · JWT | ⚠️ **1 provider** (Google), le cours en demande **3** |
| 🗄️ | **Opérations BDD** | abstraction · sécurité · perf | **Supabase PostgreSQL** · table `versions` (`parent_id` = arbre branches, CTE récursifs) · RLS | ✅ |
| 📈 | **Métriques** | temps réel · Prometheus + Grafana | endpoint `/metrics` · **Prometheus + Grafana** | ✅ |
| 📪 | **Notifications Mail + SMS** | email + SMS · suivi livraison · RGPD | **Resend** (email) + **Twilio** (SMS) | ✅ (à confirmer câblage) |
| 🤖 | **Traitement IA** (cœur, à vendre) | outil IA · interface avec autres services | **OpenAI `gpt-4o-mini`** → **AI Patch Note** = le produit vendu | ✅ **différenciateur** |
| 💲 | **Paiements** | Stripe/PayPal · abonnements récurrents · facturation | **Stripe** · Free / Pro 12 € / Team 39 € · webhooks signés | ✅ (MoR Lemon Squeezy en roadmap, voir mémoire) |

> **Note archi :** les 6 « services » sont implémentés en **monolithe modulaire Hono** (1 déploiement Railway, 6 domaines modulaires) — découpage prêt à extraire en microservices. À assumer face au jury comme un choix justifié (charge MVP).

---

## 3. Frontend React requis

Pages exigées par le cours :
1. **Inscription / Connexion** — inscription + email de validation · mot de passe oublié avec code SMS · bonus : double authentification (2FA).
2. **Cœur de l'app** — le service **IA à vendre** aux utilisateurs.
3. **Paiement** — plusieurs abonnements, souscription.

→ Doit **interagir avec tous les microservices**.

### Mapping Design Guardian
| Page requise | Où c'est dans Design Guardian | Tension |
|---|---|---|
| Cœur de l'app (IA) | **UI du plugin Figma** (Preact) — Timeline, Diff Viewer, AI Patch Note | ✅ c'est le produit |
| Inscription / Connexion | UI plugin (auth Supabase) | ⚠️ « email validation + mdp oublié SMS + 2FA » = plutôt un **site web compagnon** |
| Paiement | **Site web** (souscription hors plugin) | ⚠️ paiement **ne se fait pas dans le plugin** |

---

## 4. Tensions à gérer (plugin Figma vs web app classique)

Le cours suppose une **web app React** ; Design Guardian est un **plugin Figma** (UI Preact). Points à arbitrer / défendre :

1. **« Frontend React »** → l'UI du plugin est en **Preact** (React-compatible). Argument : même paradigme composant, contrainte de l'environnement Figma (webview).
2. **Pages Inscription/Paiement** → elles vivent naturellement sur un **site web compagnon** (landing + pricing + auth + Stripe Checkout), pas dans le plugin. → Clarifier si ce site existe / est à produire.
3. **3 fournisseurs OAuth** → actuellement **Google seul** (+ magic link). Gap vs l'exigence « 3 fournisseurs ». → Ajouter Facebook/GitHub OU justifier (Figma users = comptes Google majoritaires).
4. **SMS (mdp oublié)** → Twilio prévu ; vérifier que le flux « code SMS » est réellement câblé (exigé explicitement).
5. **2FA** → bonus du cours ; non prioritaire mais bon point si présent.

---

## 5. Articulation des deux contextes

- **Contexte jury (BC01)** = la **démarche de cadrage** (acteurs, faisabilité, risques, charge, archi, axes). C'est ce que l'oral de la semaine évalue.
- **Contexte cours (ce doc)** = le **produit technique** (6 services + front + IA vendable + monétisation). C'est ce qui doit *exister* derrière la démarche.
- Le **point de jonction** : le **Service IA (AI Patch Note)** est à la fois le « cœur à vendre » du cours ET le différenciateur de la cartographie concurrentielle BC01 (C1.3.2).

---

## 6. BC02 / BC03 / BC04 (cours) — exigences clés + tensions Design Guardian

> Confirmé verbatim depuis le Notion (`Web Services > Création d'une App complète`). Hors oral BC01, mais à anticiper pour le cours.

### 🧪 BC02 — Tests & Documentation
- Pyramide tests · **couverture ≥ 80 %** · tests unitaires **par service** (Auth JWT/OAuth mocks · BDD CRUD · IA mocks · Paiement webhooks Stripe · Notif templating).
- Tests d'intégration : **Inscription (Auth→BDD→Notif)** · **OAuth (Auth→Provider→BDD)** · **Souscription (Paiement→BDD→Notif)** · **Requête IA (Front→IA→BDD)**.
- **Cahier de recettes** `REC-XXX-001` · Plan anomalies **P1<4h / P2<24h / P3<1sem / P4 backlog** · **CI/CD + Quality Gate** (couv >80 %, 0 bug bloquant, 0 vuln critique, duplication <3 %) · **OpenAPI/Swagger** par service.
- **DG :** 123 tests + ≥80 % + CI/CD ✅. **Gaps :** le cahier de recettes attend **REC-AUTH-003 (Facebook OAuth)**, **REC-AUTH-005 (SMS)**, **REC-AUTH-007 (validation email)** → liés aux gaps OAuth×3 et SMS ci-dessous. Vérifier **OpenAPI** par service.

### 📊 BC03 — Pilotage & Management
- Méthodo (Scrum…) justifiée · **Product Backlog** (US-001…, MoSCoW, story points) · Sprints + vélocité · **KPIs** (vélocité/burndown/lead time/bugs/couverture) · **arbitrages documentés** (Contexte/Options/Analyse/Décision/Justification) · **management d'équipe** · communication client (Sprint Review).
- 🔴 **Tension majeure : le cours suppose une ÉQUIPE** (Tech Lead + 2 Backend + Front + DevOps), avec styles de management, répartition des tâches, plan de dev des compétences. **Tu es solo.**
  - **Parade :** présenter une **équipe simulée** (le cours lui-même utilise des exemples fictifs : US-001, Dev1/Dev2…) + toi dans plusieurs rôles. Assume le solo, montre comment tu **organiserais** à l'échelle.
- ✅ **Atout :** tes **arbitrages sont RÉELS** — le pivot **SaaS→plugin**, l'abandon `exportAsync`, le choix Railway vs edge. Ce sont des cas d'arbitrage en or (Contexte/Options/Décision).

### 🔧 BC04 — Maintenance & Exploitation
- Dépendances (**Dependabot/Renovate/npm audit**) · supervision (**health checks** · KPIs **<200 ms / taux erreur <1 % / dispo >99,5 % / CPU <70 %** · **Prometheus→Slack** · **Grafana**) · anomalies (**ELK** · fiche incident · workflow détection→clôture) · correctifs (**hotfix** · PR review · **rollback <5 min** · monitoring 24h) · amélioration continue (**NPS · rétention · MTTR · SLA**) · **Changelog** · support **N1→N4**.
- **DG :** Dependabot ✅ · Prometheus/Grafana ✅ · `/health` `/ping` ✅ · rollback Railway ✅ · CHANGELOG ✅. **Gaps :** **ELK** (centralisation logs) · support N1-N4 + Slack (solo → simulé) · **NPS/rétention** (réel ou simulé).

### Tensions transverses (récurrentes)
1. **« 6 microservices »** → monolithe modulaire Hono = **6 services modulaires** (formule à tenir partout).
2. **OAuth ×3** → actuellement **Google seul** (cours veut 3, ex. Facebook attendu en recette).
3. **Flux SMS** (mdp oublié) → exigé (REC-AUTH-005), à câbler/vérifier.
4. **Solo vs équipe** (BC03) → équipe simulée.
