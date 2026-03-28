# TODO — Design Guardian

## Objectif final

Un plugin Figma professionnel de versioning design vendu en SaaS aux équipes design/produit.
Différenciateur : diff géométrique précis au pixel, attribution par designer, AI Patch Note, Gold status.
Cible : UX designers, illustrateurs vectoriels, packaging designers, brand designers.

---

## Prochaines tâches

### Priorité 1 — Soutenance M2

- [ ] **BC01** — Finaliser le dossier de cadrage (stakeholders, faisabilité, budget, architecture, deck 15-20 slides)
- [ ] **BC02** — Tests unitaires manquants (svg-generator.service, checkpoints.controller) + cahier de recettes REC-XXX-001
- [ ] **BC02** — Pipeline CI/CD GitHub Actions (build → tests → quality gate → deploy Railway)
- [ ] **BC03** — Vidéo Sprint Review 10-15 min (démo du plugin en conditions réelles)
- [ ] **BC04** — Health check endpoint sur le backend (`/api/health`) + Dependabot activé
- [ ] **BC04** — Changelog `CHANGELOG.md` avec historique des versions

---

### Priorité 2 — Produit (après soutenance)

- [ ] **Option 2 SVG** — Implémenter Figma REST API `format=svg` sur branche `feat/figma-rest-png`
  - Auth : Personal Access Token en settings plugin (démo) → OAuth 2.0 Figma (prod)
  - Stocker le SVG Figma au moment du checkpoint, pas à la consultation
- [ ] **Auth utilisateur** — Supabase Auth (OAuth Google + magic link) + `figma.clientStorage` pour le token
- [ ] **Modèle économique** — Lemon Squeezy ou Paddle (Free / Pro / Team) — souscription sur site web
- [ ] **Timeline UI** — Améliorer le rendu GitKraken-style avec branches visuelles
- [ ] **Diff texte avancé** — Comparer `characters` mot par mot (type diff littéraire)
- [ ] **Microservices M2** — Valider avec le prof si l'architecture actuelle suffit ou si refactor requis

---

### Backlog

- [ ] Multi-sélection de nodes à versionner (pas seulement 1 node par checkpoint)
- [ ] Commentaires sur un checkpoint (annotation de version)
- [ ] Export du diff en PDF (rapport pour client)
- [ ] Notifications Slack/email sur changement de statut Gold
- [ ] SDK public pour intégration dans d'autres outils (Jira, Notion)
