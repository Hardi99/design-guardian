# Fiche Figma Community — Design Guardian (à publier avec la resoumission V5)

> Reflète le produit actuel : diff **frame-héros** (surlignage + clic-pour-révéler), **authored-only** (montre l'intention, pas le bruit), restore honnête, précision 0,01px. Mène avec le **moat** (diff), pas avec l'IA. Cible la **niche**.

---

## Titre / tagline
**Git pour le design — versionne tes maquettes au pixel près, dans Figma.**

## Description (corps de la fiche)

Design Guardian capture des **checkpoints** de tes designs et compare les versions **au pixel près** — directement dans Figma. Tu vois exactement ce qui a changé : position, taille, couleur, contour, typographie, avec une précision de **0,01px** et **l'auteur de chaque changement**.

La vue diff met la **frame en grand** et **surligne les éléments modifiés** dessus : clique un surlignage pour voir le détail (avant / après + valeurs). Surtout, on te montre **ce que tu as touché à la main** — les conséquences dérivées (un élément déplacé parce que son conteneur a bougé, un reflow auto-layout) sont **repliées**, pas étalées. Le signal, pas le bruit.

Restaure une version antérieure **à l'identique**, navigue d'une version à l'autre d'un clic, et valide tes assets avec le statut **Gold** avant livraison.

**Pensé pour les designers où le détail compte :** design systems, UI pixel-perfect, illustration vectorielle, packaging.

▎ **Diff géométrique 0,01px** propriété-par-propriété — pas juste un aperçu visuel
▎ **Authored-only** : montre tes gestes, masque les conséquences dérivées
▎ **Frame surlignée + clic-pour-révéler** le détail de chaque changement
▎ **Attribution par élément** : qui a changé quoi, quand
▎ **Restore** fidèle d'une version (avec indication honnête quand c'est approximatif)
▎ **Statut Gold** pour valider avant livraison
▎ Résumé des changements en langage clair *(bonus IA)*

**Honnête par design** : l'outil indique toujours quand un aperçu est approximatif ou quand un restore ne peut pas tout recréer. Un outil de versioning ne doit jamais te faire croire que tu as récupéré ce que tu n'as pas.

**Complément** de l'historique natif de Figma : la granularité par-élément et la précision numérique qu'il ne donne pas.

## Étiquettes
`#versionning` · `#diff` · `#designsystems`

## Contact / support
design-guardian@proton.me *(ou ton email actuel — harditabuna@gmail.com)*

---

## ⚠️ Rappels avant de publier
1. **Resoumettre le build V5** (le `dist` actuel) — la fiche promet le nouveau diff-viewer ; la version publiée (V4, 9 juin) ne l'a pas.
2. **Refaire les 3 captures** depuis la nouvelle UI : la **frame surlignée**, le **détail au clic**, les **chips Avant/Après + dérivés**. Les captures actuelles datent de V4 (render cassé, pas de surlignage).
3. Publier **ce texte + ces tags en même temps** que le build, pas avant (sinon sur-promesse).
4. Vérifier dans le manifest : pas de permission `"exports"`, `allowedDomains` = Railway + Supabase, version incrémentée.
