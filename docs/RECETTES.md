# Cahier de Recettes — Design Guardian

**Projet :** Design Guardian — Plugin Figma de versioning design
**Version :** 1.0
**Date :** 2026-03-31

---

## Méthodologie

- **Environnement :** Plugin chargé en local via Figma Desktop (mode développeur)
- **Backend :** `https://design-guardian.up.railway.app` (production) ou `localhost:3001` (local)
- **Prérequis communs :** Figma Desktop installé, accès internet, compte Figma actif

---

## Module AUTH — Authentification & Initialisation

### REC-AUTH-001 — Auto-initialisation du projet au lancement

| Champ | Valeur |
|-------|--------|
| **ID** | REC-AUTH-001 |
| **Fonctionnalité** | Auto-init projet via `figma.fileKey` |
| **Préconditions** | Plugin installé, fichier Figma ouvert, backend accessible |
| **Étapes** | 1. Ouvrir un fichier Figma<br>2. Lancer le plugin Design Guardian<br>3. Observer l'écran de chargement |
| **Résultat attendu** | Le plugin affiche l'écran Assets en < 3s. La réponse contient `api_key` et `project.plan` |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

### REC-AUTH-002 — Reconnexion sur un fichier déjà connu

| Champ | Valeur |
|-------|--------|
| **ID** | REC-AUTH-002 |
| **Fonctionnalité** | Idempotence `auto-init` — même clé retournée |
| **Préconditions** | REC-AUTH-001 exécuté au moins une fois |
| **Étapes** | 1. Fermer le plugin<br>2. Relancer le plugin sur le même fichier |
| **Résultat attendu** | Le même `api_key` est retourné. Aucun doublon créé en base. |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

### REC-AUTH-003 — Serveur inaccessible

| Champ | Valeur |
|-------|--------|
| **ID** | REC-AUTH-003 |
| **Fonctionnalité** | Gestion d'erreur réseau |
| **Préconditions** | Backend coupé ou réseau désactivé |
| **Étapes** | 1. Couper le réseau<br>2. Lancer le plugin |
| **Résultat attendu** | Message d'erreur affiché : "Impossible de joindre le serveur." |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

---

## Module IA — Génération de Patch Note

### REC-IA-001 — Génération patch note sur changement géométrique

| Champ | Valeur |
|-------|--------|
| **ID** | REC-IA-001 |
| **Fonctionnalité** | AI Patch Note GPT-4o-mini sur diff |
| **Préconditions** | Asset créé, au moins 1 checkpoint existant, sélection Figma active |
| **Étapes** | 1. Sélectionner un frame dans Figma<br>2. Modifier sa largeur (+50px)<br>3. Cliquer "Capturer un checkpoint"<br>4. Observer le résumé affiché après sauvegarde |
| **Résultat attendu** | Le résumé mentionne `@AuthorName` et la modification de `width`. Format : "a modifié X propriété(s)" |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

### REC-IA-002 — Patch note sur premier checkpoint (sans diff)

| Champ | Valeur |
|-------|--------|
| **ID** | REC-IA-002 |
| **Fonctionnalité** | Comportement sur snapshot initial sans version précédente |
| **Préconditions** | Asset vide (aucun checkpoint) |
| **Étapes** | 1. Sélectionner un frame<br>2. Capturer un premier checkpoint |
| **Résultat attendu** | `ai_summary` = "Aucune modification détectée. Les éléments sont identiques." ou résumé neutre |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

### REC-IA-003 — Fallback si OpenAI indisponible

| Champ | Valeur |
|-------|--------|
| **ID** | REC-IA-003 |
| **Fonctionnalité** | Résilience du service IA |
| **Préconditions** | Clé OpenAI invalide configurée temporairement |
| **Étapes** | 1. Capturer un checkpoint avec des changements détectables |
| **Résultat attendu** | Checkpoint sauvegardé avec `ai_summary` de fallback (ex: "@Alice — 2 élément(s) modifié(s).") |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

---

## Module PAIEMENT — Plans & Limites

### REC-PAY-001 — Affichage du plan actuel

| Champ | Valeur |
|-------|--------|
| **ID** | REC-PAY-001 |
| **Fonctionnalité** | Badge plan visible avec tooltip |
| **Préconditions** | Plugin initialisé |
| **Étapes** | 1. Observer le header de l'écran Home<br>2. Passer la souris sur le badge plan |
| **Résultat attendu** | Badge affiche "FREE", "PRO" ou "TEAM" en majuscules. Tooltip décrit le plan. |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

### REC-PAY-002 — Limite Free (10 checkpoints)

| Champ | Valeur |
|-------|--------|
| **ID** | REC-PAY-002 |
| **Fonctionnalité** | Blocage capture sur plan Free à 10 checkpoints |
| **Préconditions** | Compte Free, 10 checkpoints existants sur l'asset |
| **Étapes** | 1. Tenter de capturer un 11e checkpoint |
| **Résultat attendu** | Bouton "Capturer" désactivé. Message "Limite Free atteinte (10 checkpoints). Passer à Pro" visible |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

### REC-PAY-003 — Lien "Passer à Pro" fonctionnel

| Champ | Valeur |
|-------|--------|
| **ID** | REC-PAY-003 |
| **Fonctionnalité** | Redirection vers page pricing |
| **Préconditions** | Plan Free, limite atteinte |
| **Étapes** | 1. Cliquer sur "Passer à Pro" |
| **Résultat attendu** | Navigateur ouvre `https://design-guardian.up.railway.app/pricing` |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

---

## Module VERSIONING — Checkpoints & Diff

### REC-VER-001 — Capture d'un checkpoint

| Champ | Valeur |
|-------|--------|
| **ID** | REC-VER-001 |
| **Fonctionnalité** | Création d'une version avec snapshot Figma natif |
| **Préconditions** | Asset sélectionné, frame Figma sélectionné |
| **Étapes** | 1. Sélectionner un frame<br>2. Cliquer "Capturer un checkpoint"<br>3. Cliquer "Save Checkpoint" |
| **Résultat attendu** | Version créée, affichée dans la timeline avec `v{N}`, auteur, timestamp et AI summary |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

### REC-VER-002 — Vue Diff (Split/Overlay)

| Champ | Valeur |
|-------|--------|
| **ID** | REC-VER-002 |
| **Fonctionnalité** | Visualisation des différences visuelles |
| **Préconditions** | Au moins 2 checkpoints sur la même branche |
| **Étapes** | 1. Cliquer sur une version dans la timeline<br>2. Sélectionner "Frame" puis "Split" |
| **Résultat attendu** | Deux rendus SVG côte-à-côte (avant/après). Aucune erreur. |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

### REC-VER-003 — Restore d'une version

| Champ | Valeur |
|-------|--------|
| **ID** | REC-VER-003 |
| **Fonctionnalité** | Créer un nouveau checkpoint depuis une version historique |
| **Préconditions** | Au moins 2 checkpoints |
| **Étapes** | 1. Ouvrir le diff d'une ancienne version<br>2. Cliquer "↩ Restore" |
| **Résultat attendu** | Nouveau checkpoint créé avec `snapshot_json` de la version restaurée. Retour à la timeline. |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

### REC-VER-004 — Statut Gold / Review / Draft

| Champ | Valeur |
|-------|--------|
| **ID** | REC-VER-004 |
| **Fonctionnalité** | Cycle de statut avec explication Gold |
| **Préconditions** | Version en Draft |
| **Étapes** | 1. Ouvrir une version<br>2. Cliquer le bouton statut 2 fois (Draft → Review → Gold)<br>3. Passer la souris sur le badge Gold |
| **Résultat attendu** | Badge passe Draft → Review → ✦ Gold. Tooltip : "Version validée, référence officielle du projet." |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

---

## Module BRANCHES — Isolation via pages Figma

### REC-BR-001 — Création d'une branche

| Champ | Valeur |
|-------|--------|
| **ID** | REC-BR-001 |
| **Fonctionnalité** | Création d'une page Figma `dg/{branchName}` |
| **Préconditions** | Frame sélectionné dans Figma |
| **Étapes** | 1. Taper "feat/dark-mode" dans le champ "+ branche"<br>2. Appuyer sur Entrée |
| **Résultat attendu** | Page Figma `dg/feat/dark-mode` créée avec clone du frame. Figma navigue vers cette page. |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

### REC-BR-002 — Switchde branche

| Champ | Valeur |
|-------|--------|
| **ID** | REC-BR-002 |
| **Fonctionnalité** | Navigation Figma lors du switch de branche |
| **Préconditions** | Au moins 2 branches créées |
| **Étapes** | 1. Cliquer sur l'onglet "main"<br>2. Cliquer sur un onglet de branche feature |
| **Résultat attendu** | Figma navigue vers la page correspondante. Le canvas change visuellement. |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

### REC-BR-003 — Création sans sélection

| Champ | Valeur |
|-------|--------|
| **ID** | REC-BR-003 |
| **Fonctionnalité** | Message d'erreur si aucun frame sélectionné |
| **Préconditions** | Aucun élément sélectionné dans Figma |
| **Étapes** | 1. Désélectionner tout dans Figma<br>2. Créer une nouvelle branche |
| **Résultat attendu** | Alert "[DG] Sélectionne au moins un frame pour créer la branche." |
| **Résultat obtenu** | ✅ Conforme |
| **Statut** | PASS |

---

## Plan de correction des anomalies

| Priorité | Délai | Critères |
|----------|-------|---------|
| **P1 — Critique** | < 4h | Crash plugin, perte de données, impossible de créer un checkpoint |
| **P2 — Majeur** | < 24h | Diff incorrect, IA silencieuse sans fallback, auth échoue |
| **P3 — Mineur** | < 1 semaine | Affichage incorrect, texte tronqué, tooltip manquant |
| **P4 — Évolution** | Backlog | Merge de branches, Export PDF, notifications |

---

## Couverture tests automatisés

| Service | Tests | Couverture |
|---------|-------|------------|
| `diff.service` | 29 cas | Géométrie, visuel, texte, vecteurs, structurel |
| `openai.service` | 10 cas | Zero-change, fallback erreur, réponse AI, prompt |
| `svg-generator.service` | 19 cas | Rect, Ellipse, Text, Gradients, findNodeById |
| `plugin.middleware` | 5 cas | Missing header, invalid key, valid key + projectId |
| **Total** | **63 tests** | **4 fichiers** |
