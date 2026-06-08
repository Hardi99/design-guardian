# BC03 — Arbitrage documenté : suppression d'un asset (soft vs hard delete)

> Cas d'arbitrage réel (C3.2.2) — format Contexte / Options / Analyse / Décision / Justification.

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
