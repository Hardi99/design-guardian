# Questions ouvertes — Design Guardian

## Auth & Sécurité
- [ ] Un utilisateur qui connaît une clé API peut envoyer n'importe quel `figma_id` en body — acceptable pour MVP, à durcir comment en prod ?
- [ ] Distribution des clés API : l'admin crée le projet sur design-guardian.app et partage la clé. Quel format ? UUID ? token court lisible ?
- [ ] Expiration des clés API — rotation nécessaire ?

## Plan & Limites
- [ ] Comment enforcer les limites Free (10 checkpoints, 1 branche) côté backend sans compter à chaque requête ? (compteur en base vs. check à la volée)
- [ ] Le plan est sur `projects` — que se passe-t-il si un utilisateur a plusieurs projets sur des plans différents ?

## Fonctionnalités manquantes (pas encore implémentées)
- [ ] **Diff Viewer** — Split View + Overlay : composant non implémenté dans le plugin
- [ ] **Restore this Version** — UI + endpoint backend manquants
- [ ] **Create Branch from here** — UI + logique backend manquants
- [ ] **Mark as Approved / Revoke** — boutons UI manquants dans la timeline
- [ ] **Merge** — Bonus, non implémenté

## Supabase
- [ ] Bucket Storage `design-guardian` — doit être créé manuellement dans le dashboard Supabase (ou via migration SQL)
- [ ] La table `profiles` a encore `id REFERENCES auth.users(id)` — si on ne crée plus de comptes Supabase pour les utilisateurs Figma, cette FK bloque les upserts. À supprimer ou découpler ?
- [ ] RLS (Row Level Security) — pas encore configurée. À définir par projet/asset avant mise en prod.

## Déploiement Railway
- [ ] Variables d'environnement à configurer : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, `PORT`
- [ ] Health check Railway : `GET /health` ✅ déjà en place
- [ ] Build command : `npm run build` — à vérifier que `backend/package.json` a un script `build` correct

## Plugin Figma
- [ ] ID du plugin — `design-guardian-dev` est un placeholder. À enregistrer sur le portail Figma Developer pour publication sur Figma Community
- [ ] `networkAccess.reasoning` — requis pour la review Figma Community, à rédiger proprement
- [ ] Test sur Figma Desktop vs Figma Web — comportements différents pour `exportAsync` ?

## Web App (frontend Next.js)
- [ ] Quel est son rôle exact ? Uniquement gestion de compte / facturation / création de projets + récupération de la clé API ?
- [ ] L'auth web app utilise encore Supabase JWT — cohérent avec la séparation plugin (clé API) / web (JWT)

## UX
- [ ] Comment l'utilisateur obtient sa clé API ? Flux complet sur design-guardian.app non implémenté
- [ ] Onboarding zero-friction : si le plugin est installé dans un fichier Figma partagé, tous les membres de l'équipe voient-ils la même timeline automatiquement ?
