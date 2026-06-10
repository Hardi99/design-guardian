# BC03 — Arbitrage : Scoping & filtrage des assets dans le plugin

> Format pilotage : **Contexte · Options · Analyse · Décision · Justification**.
> Arbitrage réel issu d'une question produit : « peut-on filtrer les assets du plugin selon le projet / la frame sur laquelle on est dans Figma ? »

---

## Contexte

Le plugin liste les **assets** (éléments de design suivis) d'un **projet**. Question : peut-on les filtrer selon le contexte Figma courant, et comment gérer les cas limites (lancement hors projet, plusieurs pages, bascule entre projets) ?

**Contrainte plateforme dure** : un plugin Figma s'exécute dans le contexte d'**un seul fichier** — celui où il a été lancé. Il **ne peut pas** voir les autres fichiers ni la « Project » (dossier) Figma parente (l'API n'expose que `figma.fileKey`, pas la hiérarchie team/folder).

**Collision de vocabulaire** à lever :

```
Figma :  Team → "Project" (dossier) → File → Page → Frame/node
DG :                                    └── = 1 projet Design Guardian
                                              └── pages, dont des `dg/branch` (= branches)
```

→ Un **projet Design Guardian = un fichier Figma** (`figma_file_key`). Et **les branches sont des pages** (`dg/branchName`).

## Options

| Axe de scoping | Description | Faisabilité |
|---|---|---|
| **A. Projet (fichier)** | Frontière `file_key` → `api_key` ; 1 instance plugin = 1 fichier | Déjà en place (la seule frontière connaissable) |
| **B. Page brute** | Filtrer par `figma.currentPage` | Faisable mais **piège** : les pages `dg/*` sont des branches, pas des zones de design |
| **C. Branche** | Filtrer par branche courante (`dg/` page) | Déjà modélisé (`handleSwitchBranch`) |
| **D. Sélection (frame/node)** | Filtrer/surligner par `figma.currentPage.selection` (`selectionchange`) | Faisable, mais le node tracké est aujourd'hui sur `versions.figma_node_id`, pas sur l'asset |

## Analyse

- **A est non négociable** : c'est la seule frontière que le plugin peut connaître. Toute idée de « plugin global qui suit le fichier actif » est une impasse (sandbox par fichier).
- **B est trompeur** : filtrer par page brute confond *zone de design* et *branche*. Quand l'utilisateur passe sur `dg/feature-x`, un filtre « page courante » contredit le modèle de versioning.
- **C** est le bon axe interne : l'axe « page utile » = la **branche**, déjà géré.
- **D** est un raffinement transitoire (surbrillance), pas une frontière.

**Cas limites identifiés :**
1. **Lancement hors projet** (fichier neuf / draft / vide) → aujourd'hui `auto-init` crée un projet **dès l'ouverture** → pollution de la table `projects` par des projets vides.
2. **Dérive d'identité draft → team** : ordre de résolution `figma.fileKey ?? pluginData ?? clientStorage ?? generate`. Un draft (sans `fileKey`) génère un id ; publié en team il **gagne un `fileKey`** qui **prime** → l'identité change → historique orphelin, projet dédoublé.
3. **Bascule entre 2 fichiers** : 2 instances isolées. Risque = cache mal keyé (l'`api_key` du fichier A fuit sur B) + **race async** (réponse du contexte A qui arrive après bascule vers B).

## Décision

**Modèle de scoping à 3 niveaux :**

| Niveau | Unité | Stabilité | Rôle |
|---|---|---|---|
| **0 — Projet (fichier)** | `file_key` → `api_key` | Immuable pour la session | Frontière dure |
| **1 — Branche** (`dg/` page) | `handleSwitchBranch` | Change en session | **Axe interne** (pas la page brute) |
| **2 — Sélection** (frame/node) | `selectionchange` | Transitoire | Filtre/surbrillance optionnel |

**Règles d'implémentation :**
- Liste d'assets **plate au niveau projet** ; filtrage interne par **branche**, surbrillance optionnelle par **sélection**. **Jamais** de filtre par nom de page brut.
- **Création de projet *lazy*** : différer l'écriture en base au **premier checkpoint** (ne pas créer de projet pour un fichier simplement consulté).
- **Identité stable** : une fois `dg_file_id` écrit dans `pluginData`, **il fait foi** (priorité au `pluginData` sur `figma.fileKey`, ou table de correspondance `generated_id ↔ real_fileKey` pour fusionner).
- **Isolation inter-fichiers** : tout cache **keyé par `file_key`**. Une instance ne suit jamais un autre fichier.
- **Anti-race** : token de contexte (`file_key` + branche + node) ; **ignorer toute réponse** dont le token ne matche plus le courant + `AbortController` au changement de contexte. Source de vérité = l'état courant, **jamais** « la dernière réponse arrivée ».

## Justification

- Respecte la **contrainte plateforme** (sandbox par fichier) au lieu de la combattre.
- Évite la confusion **page vs branche** qui casserait le modèle de versioning.
- Traite les **cas limites** (hors projet, draft→team, bascule) plutôt que de les découvrir en production chez l'early-adopter.
- Le filtrage interne (branche/sélection) est **local et débouncé** → fluide même en bascule rapide, sans charge réseau ni race.

> **Dette à régler avant scale** : création de projet *eager* → *lazy* ; dérive d'identité draft→team (priorité `pluginData`). Documenté ici pour ne pas l'oublier.
