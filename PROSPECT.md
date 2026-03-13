PROJECT CONTEXT: Design Guardian (The "Git" for Figma)
1. Vision & Strategic Pivot
Design Guardian est un plugin Figma de Version Control & Quality Assurance.
Il apporte la rigueur du développement logiciel (Git) dans le chaos créatif du design.
Cible : Équipes UX/UI & Product Designers.
Problème Majeur (Insight Isaac) :
La peur d'écraser : Multiplication des fichiers (v1, v2, final) par sécurité.
L'anonymat des changements : "Qui a bougé ce bouton de 2px ?" Impossible de savoir aujourd'hui.
Solution : Un plugin gérant des Branches, des Checkpoints, et l'Attribution des changements via une analyse vectorielle précise.
2. Architecture Technique (Client-Server)
Architecture découplée pour la performance et la sécurité (Niveau M2).
A. Le Client (Figma Plugin)
Stack : create-figma-plugin + React + Tailwind CSS.
Rôle : Interface riche. Récupération de l'utilisateur Figma (figma.currentUser) pour l'attribution.
Communication : POST vers l'API Backend.
B. Le Serveur (API Backend)
Stack : HonoJS (Node.js) + TypeScript.
Rôle : Orchestrateur.
Gère la logique de branchement (Main vs Feature Branch).
Exécute l'algorithme de comparaison vectorielle (xml2js + svg-path-properties).
Dialogue avec OpenAI.
C. Data Layer
Database : Supabase (PostgreSQL).
Table versions avec structure d'arbre (parent_id) pour gérer les branches.
Table users pour l'attribution (Figma ID / Name).
Storage : Supabase Storage (SVG bruts).
3. Les 3 Piliers UX/UI (Vital Aspects)
L'interface doit exceller sur ces trois points précis :
Visualisation du Temps (Timeline & Branches) :
Inspi : GitKraken.
Ne pas afficher une simple liste, mais un Arbre.
Permettre de voir la branche "Main" (Validée) et les branches "Explo" (En cours).
Chaque nœud est un Checkpoint.
Comparaison (Diff & Overlay) :
Inspi : Kaleidoscope.
Visualisation immédiate des différences géométriques.
Modes : Split (Avant/Après) et Overlay (Superposition).
Présentation de la Donnée (Smart Data) :
Inspi : Linear / Figma Properties.
Affichage structuré des changements (Couleurs, Dimensions, Positions).
Mise en valeur des "Deltas" (ex: +2px, #FF0000).
4. Fonctionnalités Clés (MVP)
Checkpointing (Save) :
Sauvegarde l'état actuel de la sélection.
Enregistre QUI a sauvegardé (Attribution).
Génère le diff mathématique.
Branching System (Isaac's Feature) :
Créer une branche "Test Couleur" depuis "Main".
Travailler sans peur de casser l'original.
(Bonus M2) "Merge" simple : Remplacer "Main" par "Test Couleur".
Blame / Attribution :
À côté de chaque changement dans le rapport, afficher l'avatar de l'auteur.
Exemple : "Radius modifié par Isaac il y a 2h".
AI Patch Note :
Résumé automatique des changements techniques en langage humain concis.
5. Règles pour l'IA (Prompts)
Format : Liste d'actions courtes style "Changelog".
Ton : Factuel, précis, design-oriented.
Exemple de sortie :
@Isaac a modifié 3 propriétés :
Corner Radius : 0 ➔ 8px
Fill : #CCC ➔ #555
Width : +24px
6. Instructions de Développement
Priorité Backend (Hono) :
Configurer Supabase pour gérer une relation parent_id (pour l'arbre des versions).
Implémenter la logique de comparaison vectorielle.
Priorité Plugin (React) :
Récupérer l'identité de l'utilisateur Figma.
Designer la vue "Arbre" (Timeline).
Mon avis sur les ajouts d'Isaac
Isaac a tapé dans le mille. Voici pourquoi ses suggestions renforcent ton projet :
1. Le Système de Branches ("Branching")
Pourquoi c'est vital : C'est le cœur du problème "Peur d'écraser". Sans branches, tu ne fais qu'un historique linéaire (comme "Ctrl+Z"). Avec des branches, tu permets l'Exploration. Un designer peut tester une version "Bleue" et une version "Rouge" en parallèle sans dupliquer le fichier 10 fois.
Impact Technique (M2) : C'est excellent pour ton dossier. Gérer une structure de données en arbre (Tree structure) dans PostgreSQL est un défi algorithmique classique et respecté. Ça montre que tu ne fais pas juste du stockage à la chaîne.
2. L'Attribution ("Qui a fait quoi")
Pourquoi c'est vital : Dans une équipe, la responsabilité est clé. Savoir que c'est "Julie" qui a changé le logo et pas "Le Stagiaire", ça change tout au processus de validation.
Impact Technique : C'est assez facile à faire (Figma te donne l'info figma.currentUser), mais ça ajoute une couche "Sociale" et "Enterprise" à ton application qui la rend beaucoup plus crédible professionnellement.

## URLs à checker avec MCP

https://cours-react.notion.site/Creation-d-une-App-complete-c3ab73b5a02747bd977772981088b812 (plus les liens des blocs de compétences)
https://linear.app/
https://kaleidoscope.app/
https://www.goabstract.com/
https://www.gitkraken.com/