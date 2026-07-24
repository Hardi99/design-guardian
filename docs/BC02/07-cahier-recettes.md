# C2.3.1 — Cahier de recettes — Design Guardian

> Compétence RNCP 39583 C2.3.1 — « Élaborer un cahier de recettes en tenant compte des exigences afin de détecter les régressions d'un logiciel, en priorisant les tests **fonctionnels, structurels et de sécurité** ». Preuves : `docs/RECETTES.md` (document maître, 22 fiches REC-XXX + plan de correction des anomalies), `backend/src/tests/branches.controller.test.ts`, `backend/src/tests/checkpoints.controller.test.ts`, `backend/src/tests/link.controller.test.ts`, `docs/BC02/04-securite-owasp.md`.

---

## Cahier de recettes

Le cahier de recettes de Design Guardian est **`docs/RECETTES.md`** — ce fichier ne le duplique pas, il renvoie vers lui et explicite la couverture par famille de tests exigée par la compétence C2.3.1.

**Méthodologie** (`docs/RECETTES.md` § Méthodologie) : plugin chargé en local via Figma Desktop (mode développeur), backend testé en production (`design-guardian.up.railway.app`) ou en local (`localhost:3001`). Chaque fiche documente Préconditions → Étapes → Résultat attendu → Résultat obtenu → Statut, sur le modèle ID `REC-{MODULE}-{NNN}`.

**22 fiches REC-XXX**, réparties par module fonctionnel — toutes au statut **PASS** au 2026-03-31 :

| Module | Fiches | Portée |
|---|---|---|
| **AUTH** | REC-AUTH-001 à 003 | Auto-init projet, idempotence, résilience serveur inaccessible |
| **IA** | REC-IA-001 à 003 | AI Patch Note (diff détecté, premier checkpoint, fallback OpenAI indisponible) |
| **PAIEMENT** | REC-PAY-001 à 006 | Badge plan, limite Free, lien pricing, catalogue de plans, Stripe Checkout, webhook d'activation |
| **NOTIFICATIONS** | REC-NOTIF-001 à 003 | Email de test, notification checkpoint, code de vérification SMS |
| **VERSIONING** | REC-VER-001 à 004 | Capture checkpoint, vue Diff Split/Overlay, restore, cycle de statut Gold |
| **BRANCHES** | REC-BR-001 à 003 | Création de branche, switch, garde-fou sans sélection |

> Note d'honnêteté reprise de `docs/RECETTES.md` § Périmètre des recettes : REC-PAY-005/006 (Stripe Checkout + webhook) et REC-NOTIF-003 (SMS) valident la **capacité backend** (endpoints + services, couverts par les tests automatisés listés ci-dessous) ; le câblage frontend complet côté webapp (bouton checkout, parcours « mot de passe oublié par SMS » de bout en bout) reste en cours de finalisation — c'est un chantier produit, pas un vide de recette côté API.

---

## Types de tests couverts

C2.3.1 exige explicitement trois familles de tests. Design Guardian les répartit ainsi, sans les confondre :

### 1. Tests fonctionnels — parcours utilisateur (recette manuelle)

Ce sont les 22 fiches `docs/RECETTES.md` elles-mêmes : exécutées manuellement dans Figma Desktop, elles valident un parcours complet du point de vue du designer, pas une fonction isolée. Exemples représentatifs :

- **REC-VER-001** — Capture d'un checkpoint (sélection → capture → apparition dans la timeline avec auteur/horodatage/AI summary).
- **REC-VER-002** — Vue Diff Split/Overlay sur deux checkpoints réels.
- **REC-IA-001** — Génération du AI Patch Note sur un changement géométrique concret (`+50px` de largeur).
- **REC-BR-001** — Création d'une branche = page Figma `dg/{branchName}` avec clone du frame sélectionné.

Ce niveau correspond au sommet de la pyramide de tests (`docs/BC02/03-tests-unitaires.md` § 1) : il couvre des flux qu'aucun test automatisé ne peut exercer seul (sélection de nœuds, rendu canvas, navigation entre pages Figma).

### 2. Tests structurels — intégration API automatisée (controllers)

Trois fichiers de test montent l'application Hono complète (`createApp()`) et simulent une requête HTTP réelle (`app.request(...)`), seule la couche Supabase étant mockée — ils valident la chaîne middleware → validation Zod → controller → réponse HTTP, pas une fonction en isolation :

| Fichier | Route testée | Tests |
|---|---|---|
| `backend/src/tests/branches.controller.test.ts` | `PUT /api/branches/versions/:id/status` | 1 |
| `backend/src/tests/checkpoints.controller.test.ts` | `POST /api/checkpoints` | 1 |
| `backend/src/tests/link.controller.test.ts` | `POST /api/link/approve`, `GET /api/link/me` | 2 |

Ces tests d'intégration s'ajoutent aux tests unitaires purs (services/reducers sans I/O — 177 tests répartis sur 18 fichiers backend et 119 tests sur 12 fichiers plugin, détail dans `docs/RECETTES.md` § Couverture tests automatisés), pour un total de **300 tests automatisés** (181 backend + 119 plugin), exécutés à chaque `push`/`pull_request` (`.github/workflows/ci.yml`).

### 3. Tests de sécurité

La sécurité est testée à deux niveaux, manuel et automatisé — le détail complet des 10 catégories OWASP est dans **`docs/BC02/04-securite-owasp.md`** ; ce cahier de recettes n'en reprend que les preuves testées :

| Contrôle | Type de preuve | Réf. |
|---|---|---|
| Serveur inaccessible (résilience réseau) | Recette manuelle | REC-AUTH-003 (`docs/RECETTES.md`) |
| Garde cross-tenant (A01 — Broken Access Control) : une version du projet `'OTHER'` appelée avec la clé API du projet `p1` → `403` | Test d'intégration automatisé | `backend/src/tests/branches.controller.test.ts:71-78` |
| Limite du plan Free (10 checkpoints/asset) : `count: 10` sur `versions` pour un projet `plan: 'free'` → `403` | Test d'intégration automatisé | `backend/src/tests/checkpoints.controller.test.ts:74-88` |
| Auth JWT sur `/api/link/approve` : requête sans `Authorization` → `401` avant toute logique métier | Test d'intégration automatisé | `backend/src/tests/link.controller.test.ts:12-21` |
| Rate-limit sur `/api/link/start` (30 req/h, bucket en mémoire par `projectId`) | Implémenté en code, **non couvert par un test automatisé dédié** (gap identifié, cohérent avec `04-securite-owasp.md` § Points d'amélioration) | `backend/src/controllers/link.controller.ts:16-29` |

Les deux gardes 403 (ownership et limite de plan) sont écrites en tant que **tests de mutation implicite** : le commentaire du test documente explicitement le scénario qui le ferait échouer si la garde de sécurité était supprimée (cf. `docs/BC02/03-tests-unitaires.md` § 4) — ce ne sont donc pas de simples tests de retour HTTP, mais la preuve que le contrôle est réellement exercé dans le chemin d'exécution.

---

## Plan d'anomalies

Repris tel quel de `docs/RECETTES.md` § Plan de correction des anomalies — priorisation appliquée en solo, sans triage d'équipe :

| Priorité | Délai | Critères |
|----------|-------|---------|
| **P1 — Critique** | < 4h | Crash plugin, perte de données, impossible de créer un checkpoint |
| **P2 — Majeur** | < 24h | Diff incorrect, IA silencieuse sans fallback, auth échoue |
| **P3 — Mineur** | < 1 semaine | Affichage incorrect, texte tronqué, tooltip manquant |
| **P4 — Évolution** | Backlog | Merge de branches, Export PDF, notifications |

Le suivi des anomalies effectivement détectées et corrigées (historique git, exemples réels par priorité) est détaillé dans `docs/BC02/08-plan-correction-bogues.md` (C2.3.2), qui s'appuie sur ce même barème.

