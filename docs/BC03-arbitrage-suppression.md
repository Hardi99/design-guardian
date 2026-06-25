# BC03 — Arbitrages documentés (C3.2.2)

> Cas d'arbitrage réels — format Contexte / Options / Analyse / Décision / Justification.
> 1. Suppression d'un asset (soft vs hard delete)
> 2. Stockage du rendu visuel (JSON-wrap vs fichier brut)

---

# Arbitrage 1 — Suppression d'un asset (soft vs hard delete)

## Contexte
La suppression d'un asset depuis le plugin déclenche un `DELETE` SQL. Deux problèmes identifiés :
1. La **cascade SQL** supprime les lignes `versions` (et leur `ai_summary`) mais **PAS les blobs Storage** (snapshots JSON + rendus `*_render.json`) → **fichiers orphelins** (fuite de stockage + survivance de données = enjeu RGPD).
2. Le `DELETE` est **irréversible** : un clic efface tout l'historique de checkpoints — ce qui **contredit la promesse produit** (« Design *Guardian* : ne jamais perdre l'historique »).

## Options
| | A — Hard delete | B — Soft delete + corbeille | C — Soft delete + purge à rétention |
|---|---|---|---|
| Réversible | ❌ | ✅ | ✅ |
| Coût Storage | minimal | croît sans limite | **borné (purge)** |
| RGPD effacement | ✅ immédiat | ⚠️ partiel | ✅ (purge immédiat sur demande) |
| Complexité | faible | moyenne | moyenne+ |

## Analyse
- **A** contredit la valeur produit (perte d'historique sur un clic) et reste exposé au bug d'orphelins si le Storage n'est pas nettoyé.
- **B** protège l'UX mais laisse le coût Storage croître indéfiniment.
- **C** concilie **UX** (undo via corbeille), **coût** (rétention bornée), **RGPD** (purge programmé + purge immédiat sur demande). C'est le standard (GitHub, Figma, Drive).

## Décision
**Option C — soft delete + purge à rétention (30 jours)**, purge immédiat sur demande RGPD.
- `assets.deleted_at TIMESTAMPTZ`, requêtes filtrées `deleted_at IS NULL`, vue Corbeille + Restaurer.
- Job de purge (cron) : à l'expiration, **hard delete** = cascade SQL **+ nettoyage Storage**.

## Justification
Cohérence avec la promesse « guardian de l'historique » (pas de destruction accidentelle) + conformité RGPD + maîtrise du coût Storage free tier.

---

## État d'implémentation (2 temps)
- **Correctif intermédiaire — FAIT** ✅ : `assets.controller.ts` nettoie désormais les blobs Storage (énumération `{assetId}/{branche}/*` sur 2 niveaux) **avant** le `DELETE`, après vérification d'appartenance. Plus d'orphelins même en hard delete.
- **Cible — roadmap (post-oral)** : migration `deleted_at` + filtres + UI corbeille + cron de purge. → relève de **BC04 amélioration continue**.

> **Lien BC02/BC04** : ce bug (orphelins Storage) constitue aussi une **fiche d'anomalie réelle** (C4.2.1) — détection → analyse → correctif → vérification.

---

# Arbitrage 2 — Stockage du rendu visuel (JSON-wrap vs fichier brut)

## Contexte
Le rendu visuel d'une version (SVG **ou** PNG natif Figma) est stocké en **base64 dans `v{n}_render.json`** (bucket `snapshots`, MIME `application/json` uniquement, migration 008). Pas de fichier image brut.

## Options
| | A — JSON-wrap (actuel) | B — Fichier brut `.svg` / `.png` |
|---|---|---|
| Taille | **+33 %** (overhead base64) | **~33 % plus léger** |
| Buckets | **1** (réutilise `snapshots`) | 2 (ou reconfig MIME) |
| Format | agnostique (SVG ou PNG dans une string) | typé par fichier |
| Servable par URL (image) | ❌ (faut désencapsuler) | ✅ |
| Migration | — | rendus existants + read/write (`checkpoints` + `branches`) |

## Analyse
- **A** privilégie la **simplicité** (un bucket, un MIME, une convention de chemin facile à énumérer/nettoyer) et colle à la consommation webview (base64 + `atob()`).
- **B** privilégie la **légèreté** (−33 %) et l'**éco-conception** (moins de bytes stockés/transférés), + permet de servir l'image directement par URL.

## Décision (tendance)
**Migrer vers B** (fichier brut dans un bucket média `image/svg+xml` + `image/png`) — priorité **légèreté + éco-conception**.

## Justification & caveat honnête
« Plus léger = mieux » est un bon principe par défaut. **Mais** : à l'échelle MVP (peu de rendus, free tier), le gain de 33 % est **marginal** face au coût (2ᵉ bucket, MIME, migration des rendus, maj read/write, gestion `.svg` vs `.png`). → **Valider que le volume justifie la migration** avant de la faire. La légèreté n'est pas gratuite.

---

# Roadmap technique post-oral
1. **Soft delete + purge à rétention** (Arbitrage 1) — migration `deleted_at` + filtres requêtes + UI corbeille + cron de purge (le purge fait le hard delete + nettoyage Storage déjà codé).
2. **Stockage rendu en fichier brut** (Arbitrage 2) — bucket média + migration des `*_render.json` → `.svg`/`.png` + maj `checkpoints` / `branches`.
