# Nouvelle UI du plugin — conception

Date : 2026-10-01 · Branche : `feat/nouvelle-ui` (partie de `fix/trous-de-detection`, non fusionnée)

## But

Une interface plus belle pour le plugin, codée maintenant. Les amis de l'utilisateur choisiront
la direction définitive plus tard : changer de direction doit coûter **un seul fichier**.

## Décisions (validées dans le chat)

- **Direction A « Figma natif »** + **résumé IA mis en avant** (emprunt à la direction C).
- **Assets et branches masqués** dans l'UI. Backend, données, store et messages inchangés :
  la suppression métier fera l'objet d'un chantier séparé.
- **Approche** : découper `plugin/src/ui.tsx` (1 437 lignes) en écrans et composants, puis
  redessiner chaque écran sur des jetons de thème.

## Thème

- `figma.showUI(__html__, { width: 400, height: 600, themeColors: true })` : Figma injecte ses
  variables `--figma-color-*` et la classe `figma-dark` sur `<html>` ; le plugin suit le thème
  clair/sombre de l'utilisateur.
- `plugin/src/theme.css` est le **seul** endroit où vivent couleurs, rayons et typo. Il déclare
  les jetons `--dg-*` à partir des variables Figma (avec valeurs de repli pour le navigateur) :
  `--dg-bg`, `--dg-bg-raised`, `--dg-bg-hover`, `--dg-bg-selected`, `--dg-text`,
  `--dg-text-muted`, `--dg-border`, `--dg-accent`, `--dg-on-accent`, `--dg-success`,
  `--dg-warning`, `--dg-danger`, `--dg-radius`, `--dg-font`.
- Tailwind consomme ces jetons via `@theme` (`bg-dg-bg`, `text-dg-muted`…) ; aucune couleur
  en dur dans les composants.
- Densité Figma : texte 11-12 px, lignes de liste 28-32 px, police Inter (celle de Figma).

## Structure des fichiers

```
plugin/src/
  ui.tsx                  point d'entrée : App, routage des écrans, écoute des messages
  theme.css               jetons (seul fichier à changer pour une autre direction)
  ui/api.ts               api(), send()
  ui/historyPick.ts       choix automatique de l'historique (logique pure, testée)
  ui/components/          Header, SummaryCard, FrameList, VersionRow, Button, Spinner…
  ui/screens/             Loading, Home, FrameHistory, Checkpoint, Diff, Upgrade
```

Découpage **sans changement de comportement** d'abord (tests verts), redesign ensuite.

## Parcours

- **Chargement** : après `FILE_INFO` + réponse du serveur, choix silencieux de l'historique
  (`historyPick`) :
  1. l'historique utilisé en dernier dans ce fichier (id mémorisé dans le cache du fichier),
     s'il existe encore ;
  2. sinon le plus récent (`/api/assets` est trié par `created_at` décroissant → le premier) ;
  3. sinon aucun → création silencieuse `POST /api/assets` au nom du fichier (`fileName`),
     type `ui`.
  Branche : `main`, implicite. L'écran « Choisir un asset » disparaît.
- **Accueil** :
  - en-tête : nom de la page Figma, pastille Free/Pro, menu discret (⋯) ;
  - carte « Dernier checkpoint » : résumé IA (ou « résumé en cours… »), auteur, date ;
    clic → son diff ;
  - liste des frames façon panneau Calques : case de suivi, icône, nom, « N v · il y a X »,
    frames non suivies grisées ; filtre au-delà de 8 frames ; estimation de durée et alerte
    « périmètre large » conservées ;
  - onglet « Toutes les versions » conservé (timeline) ;
  - bouton principal « Capturer un checkpoint », limite Free (10) conservée.
- **Menu ⋯** : lien de compte, et **seulement s'il y a plusieurs historiques** (données
  anciennes) un sélecteur d'historique ; l'alerte « Séparer / Ignorer » y est déplacée
  (pastille sur le ⋯ quand elle est active).
- **Historique d'une frame** : timeline, chaque version montre le résumé IA en premier,
  puis auteur, date, statut (Gold / Review).
- **Checkpoint** et **Diff** : mêmes fonctions, restylés sur les jetons. Le champ « branche »
  du checkpoint disparaît (toujours `main`).
- **Offre** : Free et Pro uniquement ; la carte Team 39 € (abandonnée, arbitrage 2026-09-07)
  est retirée.

## Hors périmètre

- Suppression métier des branches et des assets (backend, BDD, messages).
- Vignettes d'images par frame (direction B).
- Changements de `main.ts` autres que `themeColors` et la mémorisation de l'historique utilisé
  (champ `lastAssetId` ajouté au cache du fichier, `PERSIST_STATE`) ; aucune modification de la
  logique de capture, de diff ou de restauration.

## Erreurs

- Échec de la création silencieuse de l'historique → message sur l'écran de chargement avec
  « Réessayer » (pas d'écran bloquant muet).
- Les erreurs réseau existantes gardent leur affichage, restylé (`--dg-danger`).

## Tests

- `historyPick` : TDD Vitest (dernier utilisé présent, dernier utilisé supprimé, liste vide,
  liste non vide).
- Découpage : suites plugin (194) et backend inchangées, `tsc --noEmit` propre.
- Rendu : vérification manuelle dans Figma, thème clair **et** sombre (accueil, historique
  de frame, capture, diff, restauration, offre).
