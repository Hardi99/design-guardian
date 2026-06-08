# C1.3.2 — Étude comparative des solutions techniques — Design Guardian

> **Attention périmètre :** C1.3.2 = « **Sélectionner l'architecture technique** (étude comparative) ».
> Le critère (et le cours, livrable #6) demandent de comparer les **briques techniques** (IA, Auth, Paiement, Hébergement) et de **justifier chaque choix** — **pas** une comparaison concurrentielle produit.
> → Le **radar concurrentiel** (DG vs Branches/Abstract) reste utile mais relève du **positionnement (C1.2.1 / veille C1.3.1)**, pas de C1.3.2.

---

## Comparatif par brique (2-3 alternatives + choix justifié)

### 🤖 IA — modèle LLM (AI Patch Note)
| Critère | OpenAI `gpt-4o-mini` ✅ | Google Gemini Flash | Claude Haiku |
|---|---|---|---|
| Coût | très faible (~1 €/1 000 checkpoints) | très faible | faible |
| Latence | ~1-2 s | ~1-1,5 s | ~1-2 s |
| Qualité résumé court FR | suffisante | bonne | excellente |
| Maturité / doc / SDK | excellente | bonne | bonne |
| **Choix** | **gpt-4o-mini** — meilleur ratio coût/qualité pour des résumés courts ; SDK mûr |

### 🔐 Auth + BDD + Storage
| Critère | Supabase ✅ | Firebase | Auth0 (+ Postgres séparé) |
|---|---|---|---|
| Modèle données | **PostgreSQL** (relationnel, arbre `parent_id`) | NoSQL | externe |
| Auth intégrée | ✅ OAuth + magic link | ✅ | ✅ (auth seul) |
| Storage intégré | ✅ (snapshots) | ✅ | ❌ |
| Sécurité | RLS natif | règles | robuste |
| Coût / lock-in | free tier · open-source | lock-in Google | payant à l'échelle |
| **Choix** | **Supabase** — Postgres (CTE récursifs pour l'arbre) + Auth + Storage en un, RLS, free tier |

### 💳 Paiement
| Critère | Stripe ✅ (MVP) | PayPal | Lemon Squeezy / Paddle |
|---|---|---|---|
| Intégration dev / webhooks | excellente | moyenne | bonne |
| TVA EU | à déclarer soi-même | à gérer | **MoR — TVA auto** |
| Frais | bas | moyens | plus élevés (MoR) |
| **Choix** | **Stripe** pour le MVP (rapidité, webhooks signés) → **MoR (Lemon Squeezy) en roadmap** commercialisation pour automatiser la TVA EU |

### ☁️ Hébergement backend
| Critère | Railway ✅ | Vercel | Cloudflare Workers |
|---|---|---|---|
| Runtime | Node.js complet | serverless | edge (V8 isolates) |
| **Limite CPU** | suffisante pour le **diff lourd** | timeouts fonctions | **10-50 ms → incompatible diff** |
| Déploiement | push-to-deploy | excellent (front) | edge |
| **Choix** | **Railway** — le calcul de diff géométrique dépasse le budget CPU de l'edge ; Node.js classique requis |

---

## Synthèse — stack retenue (et pourquoi)

| Brique | Retenu | Raison n°1 |
|---|---|---|
| IA | OpenAI gpt-4o-mini | coût/qualité |
| Auth + BDD + Storage | Supabase | Postgres relationnel + tout intégré |
| Paiement | Stripe (→ MoR roadmap) | intégration rapide MVP |
| Hébergement | Railway | CPU suffisant pour le diff (edge éliminé) |
| Frontend | Plugin Figma (Preact) + Next.js compagnon | API Figma native + façade acquisition/billing |

> **Axes du critère couverts** : coût · performance/latence · sécurité (RLS, webhooks signés) · impact environnemental (gpt-4o-mini, free tier) · maintenabilité (stack TS unifiée).
> **L'élimination de l'edge (Cloudflare)** est l'argument fort : elle relie le comparatif à l'architecture (C1.5) — choix Railway justifié par une contrainte technique réelle.
