# Migrations — état & gouvernance

## Constat (audit base 2026-09-07)

- Les migrations sont **jouées à la main** dans le SQL Editor Supabase, pas via la CLI.
  Conséquence : `supabase_migrations.schema_migrations` est **vide** → la base n'a
  **aucun ledger**. On ne peut pas reconstruire l'état réel depuis le repo (`db reset`
  ne rejouerait rien), et la base peut dériver du code sans qu'on le voie.
- Dérive constatée puis corrigée : `nps_responses` (015) existait en base alors que le
  fichier n'était que sur la branche `feat/nps`. Rapatrié sur la ligne principale.
- Numérotation : deux fichiers legacy non numérotés (`add_version_status.sql`,
  `add_asset_branches.sql`) précèdent les `003 → 017`. Historique, laissés en place.

## Ordre d'application

Numérique : `003 → 004 → … → 017`. Les deux fichiers `add_*` sont antérieurs à `003`.
Toutes les migrations sont **idempotentes** (`IF NOT EXISTS`, `IF EXISTS`) et
encadrées d'un `BEGIN; … COMMIT;`.

| # | Fichier | Effet |
|---|---------|-------|
| 015 | `015_nps_responses.sql` | table `nps_responses` (RLS on, service_role only) |
| 016 | `016_nps_grants_and_fk_index.sql` | REVOKE anon/authenticated sur `nps_responses` + index FK `device_links.profile_id` |
| 017 | `017_drop_legacy_snapshot_and_author.sql` | DROP `versions.snapshot_json` (inline legacy pré-008) + `versions.author_id` (FK morte 0/83) |

## Go-forward recommandé

1. **Adopter la CLI** : `supabase migration new <nom>` puis `supabase db push` pour que
   chaque migration s'inscrive dans le ledger. Nouvelles migrations en nommage horodaté CLI.
2. **Réconcilier l'existant** : `supabase migration repair` pour marquer 003→017 comme
   déjà appliquées, sans les rejouer.
3. **Vérifier après chaque DDL** : relancer les advisors (`get_advisors` sécurité + perf).

> Tant que le ledger n'est pas en place, toute migration reste appliquée manuellement et
> la dérive peut recommencer — c'est le point à traiter en priorité côté exploitation (BC04).
