# Spec — Dossier BC02 jury (RNCP 39583) « Concevoir et développer des applications logicielles »

> Validée 2026-07-12. Livrable = **dossier écrit** (docs/BC02/) mappé aux 9 compétences C2.x de la grille jury, appuyé sur le **code source réel** de Design Guardian. Échéance : ~2 semaines. Choix acté : **combler les vrais trous code/contenu** (option B), pas seulement documenter.

---

## 0. Cadrage

- **Source d'autorité** : `Référentiel Expert en développement logiciel RNCP39583.pdf` (BLOC 2, pages 7-10) + `24 10 10 Grille évaluation Expert en développement logiciel.xlsx` (onglet « Grille Eval Bloc 2 »). **PAS** le BC02 du cours (tests/coverage/4 flux d'intégration) — celui-là est un contexte différent, plus étroit.
- **Type d'évaluation jury** : mise en situation professionnelle. Le candidat remet un **dossier écrit** comprenant le **code source d'un logiciel développé** + la documentation associée.
- **Résultat par compétence** : Acquis / Non Acquis (pas de note chiffrée). → chaque compétence doit être **démontrable par une preuve** (fichier/commit réel).
- **Principes tenus** :
  1. **Preuves réelles** — chaque affirmation pointe vers un fichier ou commit existant du repo. Zéro invention.
  2. **Honnêteté jury** — on assume le **solo** et le **monolithe modulaire Hono** (6 domaines, 1 déploiement), comme validé au BC01.
  3. **Réutiliser l'existant** — une partie du dossier est déjà amorcée (`DEPLOIEMENT.md` tagué C2.4.1, `MODE-EMPLOI-PLUGIN.md`, `RECETTES.md`, CI, Prometheus/Grafana).

## 1. Les 9 compétences BC02 (grille jury) ↔ preuves ↔ gaps

| Compétence | Livrable attendu (grille) | Critères clés | Preuve dans le repo | Gap |
|---|---|---|---|---|
| **C2.1.1** Environnements dev/test + suivi qualité/perf | Protocole de déploiement continu + critères qualité/perf | Env de dev détaillé (éditeur, compilateur, serveur d'app, gestion sources) ; séquences de déploiement ; critères qualité/perf | `.github/workflows/ci.yml`, `DEPLOIEMENT.md`, `monitoring/` (Prometheus/Grafana) | 🟡 Formaliser le protocole + critères explicites |
| **C2.1.2** Intégration continue | Protocole d'intégration continue | Explicité clairement ; séquences d'intégration | `.github/workflows/ci.yml`, Quality Gate (seuil Vitest), Dependabot | 🟡 Rédiger le protocole IC |
| **C2.2.1** Prototype (ergonomie, équipements, sécurité) | Archi maintenable + présentation prototype + framework/paradigmes | Bonnes pratiques ; prototype fonctionnel ; user stories ; composants UI ; exigences sécurité | `BC01/01-architecture.md`, plugin Preact, refonte diff-viewer frame-héros, restore `node.clone()` | 🟡 Section prototype dédiée BC02 |
| **C2.2.2** Harnais de tests unitaires | Jeu de tests couvrant la majorité du code | Tests couvrent la majorité du code développé | **300 tests Vitest** (181 back + 119 plugin), couv. backend 88 % stmts (mesuré 2026-07-12) | 🟢 Fait (baseline vivante) |
| **C2.2.3** Évolutivité + sécurité + accessibilité | Mesures sécurité (**OWASP Top 10**) + accessibilité (**référentiel** présenté/justifié/respecté) | Couvrir les 10 failles OWASP ; référentiel a11y présenté et respecté | Mesures existent (RLS, Zod, JWT, webhooks signés, X-API-Key, CORS) ; `aria`/`role` dans `ui.tsx` | 🔴 **Dossier OWASP** + 🔴 **audit accessibilité OPQUAST** |
| **C2.2.4** Déploiement progressif + versions | Historique versions + dernière version fonctionnelle | Système de gestion de versions ; évolutions tracées ; logiciel manipulable en autonomie | Git, CHANGELOG, Figma Community (mai 2026), `dg/_history` (restore lossless) | 🟡 Formaliser |
| **C2.3.1** Cahier de recettes | Scénarios + résultats attendus | Reprend toutes les fonctionnalités ; tests **fonctionnels, structurels ET sécurité** conformes au plan | `RECETTES.md` (23 fiches REC-XXX, plan P1-P4) | 🟡 Resync chiffres + rendre explicites les tests **structurels/sécurité** |
| **C2.3.2** Plan de correction des bogues | Plan de correction | Bogues détectés/qualifiés/traités ; analyse des points d'amélioration par test en échec | Historique git de fixes réels (Zod silencieux, MIME bucket, `loadAllPagesAsync`, absolute AABB…) | 🟠 Structurer les vrais bugs en fiches |
| **C2.4.1** Documentation technique | 3 manuels : déploiement + utilisation + mise à jour | Manuels clairs ; décrivent les choix techno/langages | `DEPLOIEMENT.md` ✅ · `MODE-EMPLOI-PLUGIN.md` ✅ | 🟠 **Manuel de mise à jour** manquant |

**Les 2 seuls vrais chantiers « code/contenu »** : **OWASP Top 10** (C2.2.3) et **accessibilité OPQUAST** (C2.2.3). Le reste = assemblage + formalisation de l'existant.

## 2. Décisions actées (brainstorm)

1. **Cible = jury RNCP 39583**, pas le cours. Périmètre = 9 compétences ci-dessus.
2. **Option B** : combler les trous code/contenu (OWASP, accessibilité, manuel MAJ, fiches bugs), pas seulement documenter.
3. **Référentiel d'accessibilité = OPQUAST** (pragmatique, non-réglementaire, adapté à une UI custom de plugin ; réaliste en 2 semaines). Présenté + justifié + audit + fixes.
4. **Structure = calque de `docs/BC01/`** (README index + 1 fichier par compétence/groupe), format qui a réussi au jury BC01.
5. **Preuves = pointeurs** vers fichiers/commits réels. Le dossier ne duplique pas le code, il le **référence et l'explique**.

## 3. Structure du livrable

```
docs/BC02/
├── README.md                     # Index + mapping C2.x → fichiers (comme BC01/README.md)
├── 01-environnements-ci-cd.md    # C2.1.1 + C2.1.2 : protocole déploiement continu, env de dev,
│                                 #   IC/séquences, critères qualité/perf
├── 02-prototype-architecture.md  # C2.2.1 : archi maintenable, prototype (diff-viewer frame-héros,
│                                 #   restore node.clone()), framework/paradigmes, user stories, UI, sécurité
├── 03-tests-unitaires.md         # C2.2.2 : harnais Vitest, 257 tests, couverture par service (resync)
├── 04-securite-owasp.md          # 🔴 C2.2.3 : OWASP Top 10 (2021) ↔ mesures DG + gaps/actions
├── 05-accessibilite-opquast.md   # 🔴 C2.2.3 : OPQUAST présenté/justifié + audit UI plugin + fixes appliqués
├── 06-versioning-deploiement.md  # C2.2.4 : gestion versions (git + dg/_history), évolutions tracées,
│                                 #   dernière version viable (Figma Community)
├── 07-cahier-recettes.md         # C2.3.1 : lien RECETTES.md resync + tests structurels/sécurité explicites
├── 08-plan-correction-bogues.md  # 🟠 C2.3.2 : vrais bugs (git) qualifiés/traités + analyse d'amélioration
└── 09-doc-technique.md           # C2.4.1 : index des 3 manuels (déploiement / utilisation / MAJ)
```

**Travail hors `docs/BC02/`** (le « code/contenu » réel) :
- 🧹 **Hygiène tests — retrait du code mort `block_moves`** ✅ **FAIT (2026-07-12)**. Depuis la refonte frame-héros l'UI n'affichait plus `block_moves` ; le backend le calculait pourtant encore. Retirés : `detectBlockMoves` + `commonAncestor`, le champ `block_moves` du payload (`branches.controller.ts`) et le type `BlockMove` (`diffReducer.ts`). `buildTreeMaps` conservé (sert à `derivedMoveIds` → « dérivés » toujours affichés) et déplacé dans un nouveau `tree.service.ts` (le fichier ne s'appelle plus `block-moves`). Impact : **−7 tests** (3 `commonAncestor` + 4 `detectBlockMoves`), backend **188 → 181**, tout au vert (typecheck + build).
- 🆕 **`docs/MISE-A-JOUR.md`** — 3ᵉ manuel (versioning sémantique, migrations Supabase, rollback Railway < 5 min, changelog, procédure de MAJ du plugin sur Figma Community).
- 🔧 **Fixes accessibilité** ciblés dans `plugin/src/ui.tsx` issus de l'audit OPQUAST (focus visible, labels/aria, contrastes, navigation clavier, cibles tactiles).
- 🔧 **Resync des chiffres** dans tous les docs vivants — fait 2026-07-12, **post-nettoyage** : **300 (181 back + 119 plugin)**, couv. backend 88,02 % stmts / 90,33 % lines / 92,92 % funcs / 75,42 % branches. **Baseline vivante** : à l'ajout des tests structurels/sécurité (+N), re-mesurer et re-synchroniser partout.
- 🧪 **Tests structurels/sécurité** (C2.3.1) : les tests controllers (`branches`/`checkpoints`/`link`) sont la graine d'intégration ; ajouter au besoin des cas **sécurité** explicites (auth manquante, cross-tenant, validation Zod rejetée) si l'audit OWASP révèle un trou testable.

**Note C2.2.4 (preuve utile)** : `branches.controller` — malgré son nom — est le **hub diff/versions** (le plugin l'appelle pour `/tree`, `/versions/:id`, `/status`, `/snapshot`, `/restore`). À présenter comme tel (pas un vestige « branches »).

## 4. Détail des 2 chantiers réels

### 4.1 OWASP Top 10 (`04-securite-owasp.md`)
Tableau **OWASP Top 10 (2021)** → mesure Design Guardian → preuve → statut/gap. Base honnête à partir des mesures existantes :

| # OWASP | Risque | Mesure DG (preuve) |
|---|---|---|
| A01 Broken Access Control | RLS Postgres + `security_invoker` (fuite `version_tree` corrigée, migration 2026-06-11) ; middleware `X-API-Key` par projet |
| A02 Cryptographic Failures | HTTPS Railway/Supabase ; JWT signés ; secrets en variables d'env (pas en repo) |
| A03 Injection | Requêtes paramétrées Supabase ; **validation Zod** de toutes les entrées |
| A04 Insecure Design | Séparation Service/Controller ; monolithe modulaire ; principe moindre privilège (PAT read-only, `REVOKE anon`) |
| A05 Security Misconfiguration | CORS ; `REVOKE SELECT ON profiles` ; headers ; pas de stack trace en prod |
| A06 Vulnerable Components | **Dependabot** + `npm audit` en CI |
| A07 Auth Failures | Supabase Auth (JWT, OAuth) ; Leaked Password Protection (HaveIBeenPwned) |
| A08 Data Integrity Failures | **Webhooks Stripe signés** (vérif signature) ; CI Quality Gate |
| A09 Logging/Monitoring Failures | `hono/logger`, Prometheus/Grafana, `/health` `/ping`, cible Loki |
| A10 SSRF | Pas de fetch d'URL utilisateur côté serveur ; appels sortants vers services fixes (OpenAI/Stripe/Resend/Twilio) |

→ Ce qui est **déjà couvert** = documenté avec preuve. Ce qui manque = **action listée** (ex. rate-limiting, en-têtes de sécurité) + décision (fait / backlog justifié).

### 4.2 Accessibilité OPQUAST (`05-accessibilite-opquast.md`)
- **Présenter** OPQUAST (240 bonnes pratiques qualité web) + **justifier** le choix vs RGAA/WCAG (UI custom de plugin, non-site public, pragmatisme, délai).
- **Audit** ciblé de l'UI plugin (`plugin/src/ui.tsx`) sur un sous-ensemble OPQUAST pertinent : contrastes, focus clavier visible, labels de boutons/champs, alternatives textuelles, états désactivés lisibles, cibles cliquables, feedback d'action.
- **Fixes** appliqués (petits, ciblés) + tableau « bonne pratique → état avant → action → état après ».

## 5. Périmètre / non-goals

- **Pas** de reprise du BC02 cours (4 flux d'intégration Auth/OAuth/Souscription/IA) — hors grille jury.
- **Pas** de refonte fonctionnelle : on documente et on comble, on ne réécrit pas le produit.
- **Pas** de conformité RGAA complète (audit lourd) — OPQUAST assumé et justifié.
- **Pas** d'invention de preuve : si une compétence n'a pas de preuve réelle, on le dit et on liste l'action (honnêteté jury).

## 6. Ordre d'implémentation (pour le plan)

0. **Hygiène tests** : retrait du code mort `block_moves` (−7 tests) + re-mesure de la baseline. Fait AVANT tout chiffrage figé.
1. **Squelette** `docs/BC02/README.md` + mapping (rapide, cadre tout).
2. **Assemblage à faible risque** : `03-tests-unitaires` (resync), `07-cahier-recettes` (resync + structurel/sécurité), `01-environnements-ci-cd`, `06-versioning-deploiement`, `02-prototype-architecture`.
3. **Chantiers réels** : `04-securite-owasp` (audit + rédaction), `05-accessibilite-opquast` (audit + **fixes `ui.tsx`** + rédaction).
4. **Docs manquantes** : `docs/MISE-A-JOUR.md` (3ᵉ manuel) → puis `09-doc-technique` (index).
5. **Fiches bugs** : `08-plan-correction-bogues` (extraire de l'historique git, qualifier/traiter).
6. **Vérif finale** : cohérence des chiffres partout, tous les liens/preuves valides, `npm test` + `npm run build` au vert.

## 7. Critères d'acceptation

- Les **9 compétences** C2.x ont chacune un livrable écrit + au moins une **preuve réelle** (ou une action listée si gap assumé).
- **OWASP Top 10** : les 10 catégories traitées (couvert+preuve, ou gap+action).
- **Accessibilité** : OPQUAST présenté/justifié + audit + **fixes réellement appliqués** dans `ui.tsx` (typecheck/build verts).
- **3 manuels** présents (déploiement, utilisation, mise à jour).
- **Chiffres cohérents** (nombre de tests réel mesuré) dans tout le repo (RECETTES + BC02 + CLAUDE.md).
- `npm test` (back + plugin) et `npm run build` **verts** après les fixes.
