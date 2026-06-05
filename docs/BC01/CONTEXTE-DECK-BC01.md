# CONTEXTE — Deck de soutenance BC01 (oral semaine prochaine)

> Fichier de référence pour construire et relire le deck. Il suit **à la lettre** les compétences du **Bloc 1** de la grille d'évaluation officielle *« Expert en Développement Logiciel — RNCP 39583 »* (`24 10 10 Grille évaluation`).
> **Périmètre : Bloc 1 UNIQUEMENT.** L'oral de la semaine prochaine ne porte que sur le BC01.

---

## ⚠️ RÈGLE D'OR — ORDRE NUMÉRIQUE OBLIGATOIRE

**Il faut ABSOLUMENT présenter les compétences dans l'ordre numérique croissant (C1.1.1 → C1.6).**
C'est la seule façon d'organiser le deck au mieux : le jury suit sa grille dans cet ordre, coche chaque compétence au fil de la présentation, et ne doit jamais avoir à « chercher » où une compétence est traitée. Toute slide liée à une compétence porte **son code visible** (ex. tag `C1.2.3`). Aucune compétence ne doit être présentée hors séquence.

---

## BLOC 1 — Cadrer un projet de développement d'applications logicielles

Les 11 compétences, **dans l'ordre à respecter**, avec leur livrable attendu et leurs critères d'évaluation officiels.

### C1.1.1 — Cartographier les acteurs du projet
- **Livrable :** La cartographie des parties prenantes.
- **Critères :** identifie les acteurs (développeurs, architectes, administrateurs, clients, acteurs externes), leurs **rôles** et **niveaux d'implication** ; les **caractéristiques des futurs utilisateurs** sont identifiées et détaillées.

### C1.1.2 — Analyser la demande et le besoin du commanditaire
- **Livrable :** Présentation de l'analyse de la demande, des objectifs et enjeux pour chaque partie prenante.
- **Critères :** recense et identifie besoins et attentes ; analyse **structurée** définissant objectifs et enjeux ; **problématique client identifiée** ; pistes de solutions cohérentes avec la problématique.

### C1.2.1 — Cartographier les opportunités et les menaces
- **Livrable :** Cartographie des opportunités et menaces.
- **Critères :** réalisée avec un outil adapté (ex. **SWOT**) ; définit l'impact des interactions avec d'autres projets, l'**impact environnemental**, les préconisations de **sécurité**, les points de vigilance, les opportunités à exploiter.

### C1.2.2 — Évaluer la faisabilité technique
- **Livrable :** Démarche d'audit + diagnostic des infrastructures existantes.
- **Critères :** démarche d'audit **documentée et argumentée** ; étude technique (langages, BDD, architecture existante, technologies, état des applications) ; identifie les **contraintes techniques et financières** (hébergement, OS, volume de données, nb utilisateurs, délais, ressources) ; **avis critique** sur la faisabilité.

### C1.2.3 — Cartographier les risques techniques et fonctionnels
- **Livrable :** Cartographie des risques + référentiel d'évaluation + indicateurs de contrôle.
- **Critères :** risques **cartographiés et priorisés** dans un référentiel (perte de données, interruption système, facteurs de dégradation, sécurité) ; **indicateurs de contrôle** explicités.

### C1.3.1 — Réaliser une veille technique, technologique et réglementaire
- **Livrable :** Méthodologie de recherche + sources consultées + outils de veille.
- **Critères :** synthèse des sources ; **stratégie de veille** et objectifs ; explication des outils de veille sélectionnés ; bénéfices attendus ; évolutions **classifiées et justifiées** au regard de leur impact métier et environnemental.

### C1.3.2 — Sélectionner l'architecture technique (étude comparative)
- **Livrable :** Étude comparative des solutions techniques + identification des ressources matérielles/techniques.
- **Critères :** **analyse comparative** des solutions ; choix justifiés et adaptés ; avantages/inconvénients en termes de **sécurité, environnements systèmes, réseaux, accessibilité, impact environnemental**.

### C1.4.1 — Évaluer la charge de travail
- **Livrable :** Diagramme de fonctionnalités / cahier des charges fonctionnel + estimation de la charge.
- **Critères :** fonctions recensées, caractérisées, **ordonnées et hiérarchisées** (principales, secondaires, complémentaires) ; charge exprimée en **« jour-homme »** ; outil d'analyse fonctionnelle explicité ; couverture technique justifiée ; **UX** prise en compte.

### C1.4.2 — Estimer le coût du projet
- **Livrable :** Estimation des coûts + budget prévisionnel.
- **Critères :** estimation **cohérente avec la charge** ; budget prévisionnel élaboré ; principaux **postes de coûts** identifiés (licence, développement, infrastructures, etc.).

### C1.5 — Modéliser une architecture logicielle
- **Livrable :** Schémas de l'architecture logicielle.
- **Critères :** architecture **schématisée et légendée** (signification des formes, flèches, couleurs) ; répond aux exigences des parties prenantes et contraintes de production ; **méthode/formalisme justifié** (ex. UML, Merise) ; interactions explicitées ; architecture **maintenable, sécurisée, extensible** ; **impact environnemental** pris en compte.

### C1.6 — Proposer les axes de solution au client
- **Livrable :** Préconisation des axes de solutions + argumentaire.
- **Critères :** cadre du projet et solutions préconisées exposés ; choix **argumentés** ; **vocabulaire professionnel** ; discours **vulgarisé** adapté à l'auditoire ; **objections traitées** ; supports de communication adaptés et cohérents.

---

## Ordre cible des slides (séquence imposée)

1. Couverture (présentation candidat)
2. Sommaire
3. Compétences BC01 à l'identique (tableau C1.1.1 → C1.6)
4. Un projet réel (contexte)
5. **C1.1.1** — Cartographie des acteurs
6. **C1.1.2** — Analyse de la demande / problème identifié
7. **C1.2.1** — Opportunités & menaces (SWOT)
8. **C1.2.2** — Faisabilité technique (audit de l'existant)
9. **C1.2.3** — Cartographie des risques
10. **C1.3.1** — Veille technologique & réglementaire
11. **C1.3.2** — Étude comparative des solutions
12. **C1.4.1** — Charge de travail (jour-homme)
13. **C1.4.2** — Budget prévisionnel
14. **C1.5** — Architecture logicielle (schémas)
15. **C1.6** — Axes de solution préconisés (+ démo)

> Toute slide « preuve technique » (séquence, ERD, risques résolus, etc.) se range **sous la compétence qu'elle sert**, sans casser l'ordre numérique.

---

## RÈGLES DE PRÉSENTATION (retours jury)

1. **Bullet points** — max 6 lignes par slide, pas de paragraphes. Le texte long se **dit**, ne s'écrit pas.
2. **Données chiffrées** — chaque slide doit porter au moins un chiffre concret. Utiliser les **vrais** chiffres du projet (ne jamais inventer un « +30 % »).
3. **Cible nommée** — toujours dire « graphistes, UX/UI designers, illustrateurs vectoriels & packaging designers », jamais « les utilisateurs ».
4. **Graphiques deck = simples et lisibles à 3 m** (peu de catégories, gros labels). Les **versions détaillées** (Gantt complet, séquence, ERD, archi avec main.ts/ui.tsx) sont **réservées au dossier papier**.
5. **Architecture deck** — montrer la **stack** (pas les fichiers main.ts/ui.tsx), avec des **doubles flèches « j'envoie / il répond »**.
6. **Plus de tableaux** — un tableau est plus pro et plus dense qu'une liste à puces.
7. **Vulgarisation** — finir par une slide « en une phrase » pour les jurés non-tech (analogie Git → design).

---

## OÙ METTRE LES DONNÉES CHIFFRÉES

| Slide | Chiffre(s) à afficher |
|---|---|
| **C1.1.2** Problème | Figma Branches = **45 $/mois/user** · fichier partagé à **5 designers** |
| **C1.2.3** Risques | **8 risques** matérialisés et résolus · proba/impact (1-5) |
| **C1.3.2** Comparatif | Prix d'entrée **0 € / 45 € / 29 €** · scores radar 0-5 |
| **C1.4.1** Charge & planning | **~1 600 h** · **8 sprints** · répartition % (28/18/16…) |
| **C1.4.2** Budget / qui paie | **0 €/mois** d'infra · Pro **12 €** · Team **39 €** · **540 $/an** économisés/designer |
| **C1.5** Architecture | **6 microservices** · diff **0,01px** · IA **~0,001 $/checkpoint** |
| **C1.6** Solution | **0,01px** · **540 $/an** économisés · attribution par élément |
| Démarche d'amélioration | **24 commits** en une session · **123 tests** · couverture **≥ 80 %** |
| Projet réel | Plugin approuvé Figma **mai 2026** · early adopter **actif** |

> Chiffre « impact utilisateur » à obtenir de l'early adopter (ex. « +X min gagnées par revue ») → à insérer sur **Témoignage** ou **C1.6**.

---

## OÙ METTRE LES TABLEAUX

| Slide | Tableau |
|---|---|
| **Compétences BC01** (slide 4) | Code · Intitulé · Livrable (✅ déjà un tableau) |
| **C1.2.1** SWOT | Matrice 2×2 : Forces / Faiblesses / Opportunités / Menaces |
| **C1.2.3** Risques | ID · Risque · Probabilité · Impact · Mitigation (remplace les 4 cartes) |
| **C1.3.2** Comparatif | Fonctionnalité · DG · Figma Version History · Branches · Abstract (radar au deck, **tableau au papier**) |
| **C1.4.2** Budget / qui paie | Tableau 1 : postes de coûts → 0 €/mois · Tableau 2 : Plan · Cible · Prix |
| **Risques matérialisés** (preuve) | Risque · Impact · Résolution · **Commit** (monospace) |

> Règle : si une slide est une **liste de >4 éléments comparables**, en faire un **tableau**.
