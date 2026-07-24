# C2.4.1 — Documentation technique d'exploitation — Design Guardian

> Compétence RNCP 39583 C2.4.1 — « Rédiger la documentation technique d'un logiciel (déploiement, utilisation, mise à jour) destinée à ses utilisateurs ». Preuves : `docs/DEPLOIEMENT.md`, `docs/MODE-EMPLOI-PLUGIN.md`, `docs/MISE-A-JOUR.md`.

---

## Documentation technique d'exploitation

Trois manuels couvrent le cycle de vie complet du logiciel — de l'installation initiale à sa maintenance dans le temps :

| Manuel | Fichier | Contenu |
|---|---|---|
| **Déploiement** | [`docs/DEPLOIEMENT.md`](../DEPLOIEMENT.md) | Prérequis, variables d'environnement, procédure de premier déploiement (Supabase, Railway, Stripe), pipeline CI/CD, rollback (< 5 min), monitoring post-déploiement. |
| **Utilisation** | [`docs/MODE-EMPLOI-PLUGIN.md`](../MODE-EMPLOI-PLUGIN.md) | Chaque commande du plugin (capturer, créer/changer de branche, diff, restaurer, statut Gold) avec le comportement attendu — guide d'onboarding designer et check-list de non-régression. |
| **Mise à jour** | [`docs/MISE-A-JOUR.md`](../MISE-A-JOUR.md) | Versioning Semver, mise à jour backend (CI → Railway auto-deploy, rollback), migrations Supabase (procédure + cas réel `012`/`013`), mise à jour du plugin (rebuild, republication Figma Community), gestion des dépendances (Dependabot). |

Ces trois manuels sont volontairement **disjoints par public/moment** plutôt que fusionnés en un seul document : un opérateur qui déploie n'a pas besoin du détail des commandes plugin, et un designer qui utilise le plugin n'a pas besoin de la procédure Railway — chacun reste consultable indépendamment.

---

## Choix de technologies

- Le backend est un **monolithe modulaire HonoJS** (Node.js), pas des microservices : un seul déploiement à gérer en solo, tout en gardant une séparation nette en 6 domaines (Auth, BDD, Métriques, Notifications, IA, Paiements).
- **Supabase** fournit PostgreSQL managé + Storage (snapshots) + Auth en une seule brique, ce qui évite d'opérer une base de données et un service d'auth séparés à charge solo.
- **Railway** héberge ce backend Node.js — retenu plutôt qu'un hébergement edge (Cloudflare Workers) car le calcul du diff géométrique dépasse le budget CPU d'un runtime edge.
- Côté plugin, **Preact** (plutôt que React) réduit le poids du bundle chargé dans la webview Figma, contrainte propre à l'environnement plugin.
- **OpenAI `gpt-4o-mini`** génère l'AI Patch Note (résumé des changements) à faible coût (~1 €/1 000 checkpoints), aligné avec un produit facturé 12 €/mois en plan Pro.

Justification détaillée de chaque choix (schémas d'architecture, alternatives écartées, diagrammes de séquence) : `docs/BC01/01-architecture.md`.

