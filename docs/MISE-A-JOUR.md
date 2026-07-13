# Manuel de mise à jour — Design Guardian

> C2.4.1 — Documentation technique · 3ᵉ manuel (déploiement / utilisation / **mise à jour**) · dernière mise à jour : juillet 2026

---

## Versioning

Le produit suit **Semver** (`MAJOR.MINOR.PATCH`). Chaque palier fonctionnel est tracé dans **`CHANGELOG.md`** (format [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)), catégorisé `Added` / `Changed` / `Fixed` / `Removed` / `Security`.

| Version | Date | Contenu principal |
|---|---|---|
| `1.5.0` | 2026-06-10 | Dashboard billing webapp, AI Patch Note asynchrone, CORS configurable |
| `1.4.0` | 2026-05-22 | Service Paiements (Stripe Checkout/portal/webhooks) |
| `1.3.0` | 2026-05-20 | Service Notifications (Resend + Twilio) |
| `1.2.0` | 2026-03-31 | Branch isolation via pages Figma, pipeline CI/CD |
| `1.1.0` | 2026-03-15 | Diff Viewer, Smart Data, Gold Status, Restore |
| `1.0.0` | 2026-02-28 | Plugin Figma initial, moteur de diff géométrique, AI Patch Note |

> ⚠️ **`CHANGELOG.md` est la source de vérité**, pas `package.json` : `backend/package.json` (`1.0.0`) et `plugin/package.json` (`0.1.0`) ne sont pas resynchronisés à chaque palier — ce sont des artefacts de build (npm), pas le suivi produit. Détail complet et git log : `docs/BC02/06-versioning-deploiement.md`.

---

## Mettre à jour le backend

Le déploiement est **entièrement automatisé** par la CI — pas de déploiement manuel documenté.

```
git push master
    → GitHub Actions (.github/workflows/ci.yml)
        - typecheck (tsc --noEmit)
        - tests + coverage (Quality Gate ≥ 80%)
        - build
    → si CI vert : Railway auto-deploy
        - build image
        - health check /health
        - bascule trafic (zero downtime)
```

Détail des jobs et secrets : `docs/DEPLOIEMENT.md` §5.

### Rollback (< 5 min)

En cas de régression détectée post-déploiement :

```
Railway Dashboard → projet design-guardian → Deployments
    → sélectionner le déploiement (commit) précédent
    → « Redeploy »
```

Le trafic bascule immédiatement sur l'ancienne image. Railway ne touche pas Supabase : aucune perte de données côté BDD. Procédure complète (y compris rollback base de données) : `docs/DEPLOIEMENT.md` §7.

---

## Migrations base de données

Les migrations Supabase vivent dans `supabase/migrations/`, numérotées `NNN_nom.sql`, transactionnelles (`BEGIN` / `COMMIT`) et idempotentes. Elles ne sont **jamais auto-appliquées par le code** — à relire puis appliquer manuellement (SQL Editor Supabase, ou `supabase db push`).

### Procédure

1. **Relire** le fichier SQL (garde-fous inclus : ex. vérification d'absence de doublons avant `ADD CONSTRAINT`).
2. **Appliquer dans l'ordre numérique** — chaque migration peut dépendre de la précédente.
3. **Vérifier** : requête de contrôle (ex. `SELECT` sur `pg_constraint` / `information_schema`) ou relance des endpoints concernés en staging/local avant prod.

### Cas réel — migrations 012 puis 013

- **`012_version_number_unique.sql`** — ajoute la contrainte d'unicité `(asset_id, branch_name, version_number)` pour rendre détectable (SQLSTATE `23505`) une collision de numérotation entre deux checkpoints concurrents sur le même asset/branche. Contient un garde-fou (`DO $$ ... RAISE EXCEPTION` si des doublons existent déjà) et est idempotente (vérifie `pg_constraint` avant l'`ALTER TABLE`).
- **`013_drop_legacy_version_unique.sql`** — supprime l'ancienne contrainte `versions_asset_id_version_number_key UNIQUE (asset_id, version_number)`, devenue incorrecte : elle imposait un `version_number` unique par asset **toutes branches confondues**, alors que le backend numérote **par (asset, branche)** (`createVersionAtomic`). Sans ce nettoyage, le premier checkpoint d'une 2ᵉ branche entre en collision avec `version_number = 1` de la branche `main`. Sûre par construction : retirer une contrainte ne peut pas échouer sur des données existantes, et `012` garantit déjà l'absence de doublons sur la bonne clé.

Ce couple illustre la procédure : `012` a été écrite et appliquée en premier, un audit ultérieur (2026-06-26) a révélé que la contrainte legacy restait active en parallèle — `013` corrige sans revenir sur `012`.

---

## Mettre à jour le plugin

Le plugin n'a pas de canal d'auto-update : chaque évolution nécessite une **nouvelle soumission** Figma Community.

```bash
cd plugin
npm run build
# Génère dist/main.js + dist/index.html (vite build + vite build --config vite.main.config.ts)
```

1. **Tester en local** : Figma Desktop → Plugins → Development → Import plugin from manifest (`plugin/manifest.json`).
2. **Publier** : Figma Desktop → Plugins → Publish → suivre le processus de soumission Figma Community. Délai de review Figma : 3 à 10 jours ouvrés.
3. **Versionnement** : le champ `"api"` du `manifest.json` (actuellement `1.0.0`) est la version de l'**API Plugin Figma** ciblée, pas la version du produit — ne pas le confondre avec le Semver produit (`CHANGELOG.md`). La version produit n'est pas embarquée dans le manifest ; elle se lit dans `CHANGELOG.md` au moment de la publication.

---

## Dépendances

**Dependabot** (`.github/dependabot.yml`) surveille trois écosystèmes en hebdomadaire (`backend/`, `plugin/`, npm) et mensuel (GitHub Actions) :

- Ouvre une **PR** par dépendance obsolète (limite 5 PR ouvertes simultanément par écosystème).
- **Ignore les montées majeures** (`version-update:semver-major`) — évite les breaking changes automatiques ; une montée majeure reste une décision manuelle.
- Chaque PR passe par la **CI** (typecheck + tests + coverage ≥ 80% + build) avant merge — même Quality Gate que pour le code applicatif.
- Une fois la CI verte : merge → `git push master` déclenche le déploiement standard (voir « Mettre à jour le backend » ci-dessus).

---

**Voir aussi** : `docs/DEPLOIEMENT.md` (déploiement initial et courant), `docs/MODE-EMPLOI-PLUGIN.md` (utilisation), `docs/BC02/09-doc-technique.md` (index des 3 manuels).
