# Suivi d'évaluation — Design Guardian

> Dernière mise à jour : **2026-06-08** — refonte CLAUDE.md (Design Guardian) + comparatif technique C1.3.2 + observabilité BC04 (Loki/NPS).
> Deux contextes, un seul projet — voir boussole en tête de `CLAUDE.md`.

---

## Légende
| Icône | Signification |
|-------|---------------|
| ✅ | Fait / livrable présent |
| ⚠️ | Partiel / à compléter |
| ❌ | Manquant |
| 🔒 | Éliminatoire au jury RNCP |

---

## 1. Cours Web Services (Notion)

### Microservices backend (6 services modulaires)
| # | Service | État | Fichier(s) |
|---|---------|------|-----------|
| A | **Auth** (OAuth + OpenID) | ⚠️ | Google + magic link ✅ · **3 fournisseurs + SMS ❌** |
| B | **Base de données** | ✅ | `supabase.ts`, migrations |
| C | **Métriques** | ✅ | `metrics.service.ts`, `/metrics`, `monitoring/` |
| D | **Notifications** | ⚠️ | Email Resend ✅ · **flux SMS mdp oublié ❌** |
| E | **IA** | ✅ | `openai.service.ts`, AI Patch Note |
| F | **Paiements** | ⚠️ | API + webhooks ✅ · **Stripe Checkout ❌** |

### Frontend (webapp Next.js `frontend/`)
| Page | État | Notes |
|------|------|-------|
| Landing / pricing | ✅ | prix **12/39** alignés, Stripe (footer ok) |
| Inscription / Connexion | ⚠️ | login ✅ · validation email / **SMS reset / 2FA ❌** |
| Cœur app (IA) | ✅ | plugin = surface produit |
| Paiement | ⚠️ | page pricing ✅ · **checkout Stripe ❌** |

### Blocs (cours)
| Bloc | État |
|------|------|
| **BC01** | ✅ docs + deck (finalisation Canva) |
| **BC02** | ✅ tests, OpenAPI `/api/docs`, CI/CD, recettes |
| **BC03** | ⚠️ docs ✅ · **vidéo Sprint Review ❌** · équipe simulée à rédiger |
| **BC04** | ✅ Dependabot, Prometheus/Grafana, Loki (plan), CHANGELOG, rollback |

---

## 2. Jury RNCP 39583 — Bloc 1 (oral de juin)

| Compétence | État | Fichier / Slide |
|------------|------|-----------------|
| C1.1.1 Cartographie acteurs 🔒 | ⚠️ | `03-parties-prenantes.md` · **slide → matrice Mendelow (quadrantChart) à poser** |
| C1.1.2 Analyse de la demande | ✅ | slide 7 (problème + pivot) |
| C1.2.1 Opportunités/menaces (SWOT) | ✅ | slide 8 (SWOT + sécurité/éco) |
| C1.2.2 Faisabilité technique | ✅ | slide 9 (verrous → décisions, 3 contraintes) |
| C1.2.3 Cartographie des risques | ✅ | slide 10 (matrice + tableau) · `04-risques.md` |
| C1.3.1 Veille techno/réglementaire | ✅ | slide 11 (RGPD/AI Act/DSP2) |
| C1.3.2 Étude comparative **technique** | ⚠️ | doc `05-comparatif-technique.md` ✅ · **slide à ajouter** (radar = positionnement) |
| C1.4.1 Charge de travail 🔒 | ✅ | slides 13-15 (j-h + MoSCoW + Gantt) · ~30 j-h |
| C1.4.2 Budget | ✅ | slide 16 (postes + plans 12/39) |
| C1.5 Architecture 🔒 | ✅ | slides 17-19 · `01-architecture.md` (sécu/éco/extensible) |
| C1.6 Présentation client 🔒 | ⚠️ | deck existant · **4 retouches Canva** + vulgarisation |

### Autres blocs jury (preuves déjà en place)
| Compétence | État | Note |
|------------|------|------|
| C2.2.2 Tests unitaires 🔒 | ✅ | 123 tests Vitest |
| C2.3.1 Cahier de recettes 🔒 | ✅ | `docs/RECETTES.md` |
| C2.4.1 Documentation technique 🔒 | ✅ | OpenAPI + `docs/DEPLOIEMENT.md` |
| C4.1.2 Supervision + alertes 🔒 | ✅ | Prometheus/Grafana |
| C4.2.1 Consignation anomalies | ✅ | `04-risques.md` R-M01→R-M08 (incidents réels + commits) |
| C4.3.1 Axes d'amélioration | ✅ | `docs/BC04-observabilite.md` |
| C4.3.2 Journal des versions 🔒 | ✅ | `CHANGELOG.md` |
| C3.2.2 Arbitrage documenté | ⚠️ | pivot SaaS→plugin = cas en or, à rédiger formellement |
| C3.3.1 Management équipe | ⚠️ | solo → **équipe simulée** à formaliser |

---

## 3. Ce qui reste — par priorité

### 🔴 Jury BC01 (avant l'oral)
| Item | Effort |
|------|--------|
| C1.3.2 — **ajouter la slide comparatif technique** (radar → positionnement) | Faible |
| C1.1.1 — **poser la matrice Mendelow** (quadrantChart PNG) sur la slide acteurs | Faible |
| C1.6 — **4 retouches Canva** (sommaire C1.2.2, MoSCoW, slide 18 sécu/éco, chiffre 30 j-h) | Faible |

### 🟡 Cours (post-oral)
| Item | Effort |
|------|--------|
| OAuth ×3 (Facebook/GitHub) + flux **SMS** mdp oublié | Moyen |
| **Stripe Checkout** (page pricing → souscription réelle) | Moyen |
| **Vidéo Sprint Review** 10-15 min (BC03) | Moyen |
| BC03 — équipe simulée + arbitrages formalisés | Faible |
| Déploiement réel **Loki** + prompt **NPS** in-app | Moyen |
| Vérifier couverture ≥ 80 % (`vitest --coverage`) | Faible |
