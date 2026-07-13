# C2.3.2 — Plan de correction des bogues — Design Guardian

> Compétence RNCP 39583 C2.3.2 — « Élaborer un plan de correction des bogues détectés lors des tests, en priorisant les corrections selon leur niveau de criticité, et analyser les points d'amélioration à partir des résultats des tests en échec ». Preuves : historique git réel (`git log`, `git show`), barème de priorisation de `docs/RECETTES.md` § Plan de correction des anomalies. **Aucun bug de cette fiche n'est inventé** : chaque SHA cité a été vérifié (`git show -s --oneline <sha>`) avant rédaction.

---

## Plan de qualification

Design Guardian reprend le barème de priorisation défini dans le cahier de recettes maître (`docs/RECETTES.md`, repris dans `docs/BC02/07-cahier-recettes.md`) — pas de second barème parallèle :

| Priorité | Délai de correction | Critères |
|----------|-------|---------|
| **P1 — Critique** | < 4h | Crash plugin, perte de données, impossible de créer un checkpoint |
| **P2 — Majeur** | < 24h | Diff incorrect, IA silencieuse sans fallback, auth échoue |
| **P3 — Mineur** | < 1 semaine | Affichage incorrect, texte tronqué, tooltip manquant |
| **P4 — Évolution** | Backlog | Merge de branches, Export PDF, notifications |

Sur un projet solo (pas d'équipe de triage), la qualification se fait au moment où le bug est reproduit : le symptôme est classé dans la case la plus proche du barème ci-dessus, puis corrigé dans le délai correspondant avant de passer à la tâche suivante — c'est le fonctionnement réel constaté sur l'historique git (les fiches ci-dessous montrent des correctifs le jour même de la détection, cohérent avec P1/P2).

---

## Fiches de bogues traités

6 bogues réels, choisis pour représenter des catégories différentes (validation de schéma, contrainte du webview Figma, valeur spéciale de l'API Figma, contrainte d'un service tiers, géométrie, API `dynamic-page`). Chaque SHA a été vérifié par `git show -s --oneline <sha>` avant d'être cité ici — voir la liste de vérification en fin de fiche.

| ID | Symptôme | Cause racine | Priorité | Correctif (commit réel) | Amélioration / règle |
|---|---|---|---|---|---|
| **BUG-01** | Des champs pourtant capturés côté plugin (`characters`, `effects`, `rotation`, `gradientStops`…) n'apparaissaient jamais dans les checkpoints en base — disparition silencieuse, aucune erreur | Le schéma de validation Zod (`backend/src/types/api.ts`) ne déclarait pas ces champs sur `nodeSnapshotSchema` ; `z.object()` sans `.strict()` **supprime silencieusement** toute clé non déclarée du payload validé | **P2** | `a0126b0` — ajout de `gradientStops`, `gradientAngle`, `effects` (nouveau `figmaEffectSchema`), `rotation`, `visible`, `characters`, `fontSize`, `fontFamily` au schéma | Un champ absent en base → vérifier le schéma Zod **en premier**, avant de suspecter le plugin ou la BDD (repris en règle dans `CLAUDE.md`) |
| **BUG-02** | Sur des frames complexes (SVG lourd), l'aperçu Split/Overlay du diff restait vide dans le webview Figma, sans message d'erreur | Le SVG était encodé en data URI base64 (`<img src="data:image/svg+xml;base64,...">`) — le Chromium embarqué du webview Figma échoue silencieusement au-delà d'une certaine taille d'attribut `src` | **P2** (fonctionnalité cœur — diff visuel — rendue muette sur des assets réels, pas un simple défaut cosmétique) | `da85c8d` — rendu SVG inline via un composant `SvgFrame` (`dangerouslySetInnerHTML` + `atob(b64)`) au lieu du data URI dans `<img>` | Les contraintes du webview Figma (taille d'attribut, sandbox) ne sont pas documentées par Figma — à re-découvrir empiriquement. Pour du contenu volumineux, préférer un transport par blob/URL plutôt qu'un encodage inline (anticipe l'évolution vers le pipeline render blob+URL signée) |
| **BUG-03** | La capture d'un checkpoint échouait (payload corrompu) sur des nœuds ayant un `cornerRadius` « mixte » (rayons différents par coin) | `main.ts` renvoyait `node.cornerRadius` tel quel ; sur un nœud mixte, l'API Figma retourne le symbole spécial `figma.mixed`, non sérialisable en JSON (`JSON.stringify(figma.mixed)` casse le payload) | **P1** (impossible de créer un checkpoint sur ces nœuds) | `14df015` — garde de sérialisation convertissant `figma.mixed` en valeur sûre avant envoi | Toute propriété Figma pouvant être « mixed » (`cornerRadius`, `strokeWeight`, `fills` sur sélection multiple) doit passer par un garde de type avant d'atteindre le JSON envoyé au backend, pas seulement `cornerRadius` |
| **BUG-04** | Pour les frames trop lourds pour un export SVG (plan B du pipeline adaptatif : PNG borné), l'aperçu retombait systématiquement en reconstruction procédurale au lieu du rendu Figma natif — sans erreur visible | Le bucket Supabase Storage `snapshots` n'autorisait que le MIME `application/json` ; l'upload `image/png` était rejeté côté Storage, et l'erreur n'était **ni loggée ni remontée** (`await storage...upload(...)` sans vérifier `error`) | **P2** | `132a006` — MIME du bucket élargi (`image/png`, `image/svg+xml`), domaine Supabase Storage ajouté au manifest Figma (sinon le webview bloque le chargement de l'URL signée), et log de l'erreur d'upload au lieu de l'avaler | Un appel « best-effort » (qui ne doit pas faire échouer la requête principale) doit **quand même être loggé** en cas d'échec — sinon le bug ne se détecte qu'au symptôme final, plusieurs couches plus loin (ici : reconstruction silencieuse au lieu d'un rendu natif) |
| **BUG-05** | Sur un nœud avec une rotation non nulle, le cadre de surbrillance (highlight) et le crop du diff visuel étaient mal positionnés par rapport au rendu réel | `extractSnapshot` stockait `x/y/width/height` dans le repère non-tourné du nœud (transform-origin), pas sa bounding box visuelle absolue ; le calcul de highlight (`nodeBbox`) utilisait ces valeurs brutes, correctes uniquement pour les nœuds non pivotés | **P3** | `00250c7` — capture et stockage de `node.absoluteBoundingBox` (AABB visuel réel) dans le snapshot (+ schéma Zod correspondant) ; `nodeBbox` l'utilise en priorité, avec repli sur `x/y/w/h` pour les versions déjà existantes | Pour un calcul géométrique dérivé (highlight, crop), utiliser une donnée **déjà résolue par Figma** (`absoluteBoundingBox`) plutôt que la reconstruire depuis transform + dimensions — Figma gère mieux les cas limites (rotation, skew) qu'un recalcul maison |
| **BUG-06** | Sur les fichiers utilisant l'accès dynamique aux pages (`documentAccess: dynamic-page`), le clone lossless vers la page `dg/_history` (utilisé pour le restore) levait une exception dans `get_children`, et le plugin dégradait silencieusement vers une ré-application de propriétés (moins fidèle), sans avertir l'utilisateur | En mode `dynamic-page`, les pages Figma doivent être chargées explicitement (`loadAllPagesAsync`) avant de lire les enfants d'une autre page — le clone/restore lisait `dg/_history` sans ce chargement préalable | **P2** (dégradation silencieuse d'une fonctionnalité cœur — le restore lossless — sans message d'erreur) | `a0b92a0` — `loadAllPagesAsync()` appelé à l'initialisation du plugin, avant capture et avant restore | Toute API Figma documentée « `dynamic-page` » impose de charger explicitement les pages avant d'y accéder depuis un contexte différent — vérifier ce point pour toute future feature qui touche à plusieurs pages (ex. futur merge de branches) |

**Vérification des SHA cités** (`git show -s --oneline <sha>`, exécuté avant rédaction) :

```
a0126b0 fix: add missing fields to Zod schema (characters, effects, rotation)
da85c8d fix: inline SVG rendering for frame view to bypass data URI limits
14df015 fix: handle figma.mixed symbol in cornerRadius
132a006 fix(render): allow Supabase storage domain in manifest + surface render upload errors
00250c7 fix(diff): capture absolute AABB so highlights/crops align on rotated nodes
a0b92a0 fix(plugin): loadAllPagesAsync before history-clone/restore (dynamic-page)
```

Les 6 SHA existent et correspondent au message de commit cité dans le tableau — aucun n'est inventé.

---

## Analyse des points d'amélioration

Pour 3 des bogues ci-dessus, la règle tirée a été formalisée et réutilisée depuis (dans `CLAUDE.md` ou dans le code suivant) :

1. **BUG-01 (Zod silencieux)** — règle : *« si un champ n'apparaît pas en BDD → vérifier le schéma Zod en premier »*. Cette règle est désormais inscrite dans `CLAUDE.md` § Règles de dev, précisément parce que ce bug a coûté du temps de diagnostic (le premier réflexe était de suspecter le plugin ou le mapping BDD, alors que la donnée était strippée en amont par la validation). Elle a resservi directement sur BUG-05 (nouveau champ `absoluteBoundingBox`, ajouté au schéma Zod dans le même commit `00250c7` — sans quoi il aurait été strippé lui aussi).

2. **BUG-02 (SVG lourd en data URI)** — règle : *« pour du contenu volumineux transmis au webview, préférer un transport par blob/URL plutôt qu'un encodage inline base64 »*. Le correctif `da85c8d` (rendu inline `dangerouslySetInnerHTML`) était un correctif immédiat suffisant pour débloquer l'affichage, mais la vraie résolution structurelle est venue plus tard avec le pipeline de rendu adaptatif (SVG léger / PNG borné en blob+URL signée Supabase Storage, cf. BUG-04) — l'aperçu ne transite plus par un encodage inline dans le payload JSON du checkpoint.

3. **BUG-04 (MIME bucket, échec avalé)** — règle : *« un appel best-effort qui échoue doit être loggé, jamais avalé en silence »*. Avant `132a006`, l'upload du rendu PNG échouait sans qu'aucune trace ne le signale — le seul symptôme observable était un aperçu de moins bonne qualité (reconstruction procédurale au lieu du rendu Figma natif), impossible à distinguer d'un choix voulu sans instrumentation. Le correctif ajoute `if (renderErr) console.warn(...)`, ce qui aurait réduit le temps de diagnostic de ce bug lui-même s'il avait été appliqué dès l'écriture initiale du code d'upload.

**Limite honnête** : ce plan documente 6 bogues corrigés a posteriori depuis l'historique git — il n'existe pas de suivi d'anomalies outillé (pas de Jira/Linear, pas de label GitHub Issues dédié) sur un projet solo. La traçabilité repose sur les messages de commit `fix(...)`, ce qui est suffisant pour un solo mais serait la première chose à outiller (labels + template d'issue) en cas de montée en équipe (cf. axes post-oral BC01 sur la montée en charge).
