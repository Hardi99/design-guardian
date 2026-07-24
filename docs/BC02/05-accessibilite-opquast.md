# C2.2.3 — Accessibilité (OPQUAST) — Design Guardian

> Compétence RNCP 39583 C2.2.3, volet accessibilité (le volet sécurité OWASP de la même compétence est traité dans `docs/BC02/04-securite-owasp.md`). Périmètre : l'UI Preact du plugin Figma (`plugin/src/ui.tsx`), une webview qui s'affiche **dans** Figma, pas un site public. Preuves citées `fichier:ligne`. Chaque ligne du tableau « Audit » a été vérifiée par grep + lecture du code, avant ET après les corrections appliquées dans le commit associé à ce fichier (2026-07-13).

---

## Référentiel choisi — OPQUAST

**OPQUAST** (« Open Quality Standards ») est une checklist de **240 bonnes pratiques qualité web**, dont un sous-ensemble directement inspiré du WCAG couvre l'accessibilité (alternatives textuelles, étiquetage des champs, restitution des états d'interface, navigation au clavier, contraste). Elle est plus large que la seule accessibilité — elle couvre aussi l'ergonomie, la sécurité perçue, le référencement — mais c'est justement le sous-ensemble accessibilité qui est mobilisé ici.

**Pourquoi OPQUAST et pas une conformité RGAA/WCAG formelle :**

- **Pas un site public réglementé.** Le RGAA (Référentiel Général d'Amélioration de l'Accessibilité) s'applique légalement aux services publics et aux grandes entreprises privées délivrant un service au public. Design Guardian est un **plugin Figma** : son UI est une webview chargée à l'intérieur de l'outil Figma par un designer qui a volontairement installé le plugin — ce n'est pas un site web consultable par le grand public. Aucune obligation légale RGAA ne s'applique.
- **Pragmatisme et délai.** Le produit est développé solo, ~30 j-h / ~240 h sur la période Mars→Juin 2026 (charge documentée dans `docs/BC01/`). Un audit WCAG 2.1 niveau AA complet (critères de succès formels, tests avec lecteurs d'écran multiples, rapport de conformité) est hors de portée de ce budget pour une v1 de plugin B2B — mais l'absence de démarche d'accessibilité n'est pas acceptable non plus.
- **OPQUAST comme point d'équilibre.** La checklist est actionnable directement sur le code existant (alternatives textuelles, labels, états, boutons), sans lourdeur de certification, et reste alignée sur les mêmes fondamentaux que le WCAG (c'est en partie sa source). Elle permet un audit honnête et vérifiable sans revendiquer une conformité légale qui ne s'applique pas au produit.

**Ce que ce document n'est pas** : une déclaration de conformité RGAA. C'est un audit de bonnes pratiques OPQUAST appliqué à une UI de plugin, avec les manques assumés listés en fin de document.

---

## Audit

| Bonne pratique OPQUAST | État avant | Action | État après |
|---|---|---|---|
| Chaque image porteuse d'information a une alternative textuelle (`alt`) | 2 balises `<img>` sans `alt` dans `plugin/src/ui.tsx` : le rendu principal de la frame comparée (`ui.tsx:853`, composant `FrameImage`, image cliquable derrière les surlignages de `HighlightCanvas`) et les vignettes avant/après d'un élément sélectionné (`ui.tsx:834`, composant `NodeCrop`, utilisé 2 fois dans `NodeDetail` : `ui.tsx:915` pour l'avant, `ui.tsx:921` pour l'après) — confirmé par `grep -nE '<img' plugin/src/ui.tsx` → exactement ces 2 lignes | `alt="Rendu de la frame"` ajouté sur l'image de canvas (`ui.tsx:853`, informative — c'est le contenu visuel principal comparé). `NodeCrop` a reçu une prop `alt` typée (`ui.tsx:819`), branchée sur l'image (`ui.tsx:834`) et renseignée par les 2 appelants avec un texte dynamique — `alt={`Aperçu avant de ${node.nodeName}`}` (`ui.tsx:915`) et `alt={`Aperçu après de ${node.nodeName}`}` (`ui.tsx:921`), plus précis qu'un texte générique car il nomme l'élément Figma concerné | 2/2 images ont une alternative textuelle descriptive ; vérifié par relecture du fichier après modification |
| Chaque bouton a un intitulé accessible (texte visible ou `aria-label`) | 30 `<button>` recensés (`grep -nE '<button' plugin/src/ui.tsx \| wc -l`). Sur les 30, 29 avaient déjà soit un texte visible (« Créer l'asset », « Régénérer », les toggles de branche/type, etc.), soit un `aria-label` explicite (ex. `ui.tsx:270` suppression d'asset, `ui.tsx:432` sélection de version, `ui.tsx:733` cycle de statut, `ui.tsx:886` sélection d'un changement surligné). 1 bouton icône-seul sans texte visible ni `aria-label` : le bouton retour de l'écran Upgrade (`ui.tsx:155`, `←` seul) | `aria-label="Retour"` ajouté sur ce bouton (`ui.tsx:155`), cohérent avec l'intitulé déjà utilisé sur le bouton retour équivalent du composant `Topbar` (`ui.tsx:1014`) | 30/30 boutons exposent un intitulé accessible (texte visible ou `aria-label`) — vérifié par relecture de chaque occurrence de `<button` |
| Chaque champ de formulaire a une étiquette associée (`label`/`for` ou `aria-label`) | Déjà conforme avant l'audit : `<label htmlFor="new-asset-name">` associé à `<input id="new-asset-name">` (`ui.tsx:289-290`, création d'asset), `<label htmlFor="cp-branch">` associé à `<input id="cp-branch">` (`ui.tsx:552-553`, nom de branche du checkpoint), et le champ de création de branche a un `aria-label="Créer une branche"` direct (`ui.tsx:364`) | Aucune — déjà correct, vérifié et confirmé, non modifié | Inchangé : 2 paires `label`/`id` + 1 `aria-label` sur les 3 champs de saisie de l'UI |
| Les composants qui ont un état bascule (toggle) exposent cet état (`aria-pressed`) | Déjà conforme avant l'audit : 5 boutons toggle avec `aria-pressed` — type d'asset à la création (`ui.tsx:293`), branche active (`ui.tsx:361`), affichage des changements dérivés (`ui.tsx:985`), bascule Avant/Après du diff (`ui.tsx:991` et `ui.tsx:993`) | Aucune — déjà correct, vérifié via `grep -n aria-pressed plugin/src/ui.tsx` (5 occurrences), non modifié | Inchangé : 5/5 toggles exposent leur état via `aria-pressed` |
| Le contraste entre le texte et son arrière-plan est suffisant | Constat visuel uniquement, pas d'audit outillé (pas de mesure de ratio WCAG 4.5:1). 16 occurrences de classes de texte gris atténué (`text-gray-600`/`text-gray-700`) sur fond sombre (`bg-gray-950`/`bg-gray-900`), utilisées pour du texte secondaire (labels « avant »/« après », placeholders, timestamps) | Aucune — hors périmètre de cette tâche (nécessiterait un outillage de mesure de contraste et potentiellement une revue de la palette de couleurs) | Inchangé — reporté en limite assumée ci-dessous, pas présenté comme couvert |

---

## Limites assumées

- **Navigation clavier avancée partielle.** La webview Figma contraint le comportement du focus (elle s'exécute dans un cadre embarqué géré par l'hôte Figma, pas un navigateur standard). L'UI s'appuie sur le comportement natif des éléments interactifs (`<button>`, `<input>` sont focusables et activables au clavier par défaut) plutôt que sur une gestion explicite de roving tabindex ou de raccourcis génériques.
  Seuls 2 endroits ont un style de focus explicite (`focus-visible:ring-2` : `ui.tsx:365` sur le champ de création de branche, `ui.tsx:430` sur les lignes de version de la timeline) et 1 seul gestionnaire `onKeyDown` existe dans tout le fichier (`ui.tsx:368`, validation au clavier « Entrée » pour créer une branche) — confirmé par `grep -cnE 'onKeyDown|tabIndex' plugin/src/ui.tsx` → 1 occurrence.
  Le viewer de diff a des raccourcis clavier partiels documentés par `title` (`ui.tsx:719`, `ui.tsx:726` : « Version précédente (←) » / « Version suivante (→) ») mais non vérifiés comme réellement câblés au niveau document dans ce fichier.
- **Pas d'audit lecteur d'écran complet.** Aucun test manuel avec un lecteur d'écran (NVDA, VoiceOver) n'a été réalisé sur le plugin — le webview Figma n'est pas un environnement standard pour ce type de test et n'a pas été investigué ici.
  L'audit de ce document porte sur la structure du DOM et les attributs ARIA statiques (`alt`, `aria-label`, `aria-pressed`, `label`/`for`), pas sur l'expérience réelle de restitution vocale.
- **Contraste non mesuré.** Voir ligne « contraste » du tableau ci-dessus — constat visuel seulement, pas de ratio WCAG calculé.
- **Portée du fichier.** Cet audit couvre `plugin/src/ui.tsx` (l'UI du plugin, le héros pour le jury). La webapp Next.js compagnon (`frontend/`) n'est pas auditée ici.

---

*Sur les 5 bonnes pratiques OPQUAST auditées : 2 déjà conformes avant cet audit (labels de formulaire, états de bascule — la conformité y était déjà réelle, pas ajoutée pour l'occasion), 2 corrigées dans ce commit (alternatives textuelles des images, intitulé du bouton retour manquant), 1 constat non corrigé documenté en limite (contraste). Vérification de non-régression : `npm run typecheck && npm test && npm run build` — 119 tests verts, build OK.*
