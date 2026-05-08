# C1.1.1 — Cartographie des Parties Prenantes — Design Guardian

## Matrice Influence / Intérêt

```mermaid
quadrantChart
    title Parties prenantes — Influence vs Intérêt
    x-axis Faible interet --> Fort interet
    y-axis Faible influence --> Forte influence
    quadrant-1 Gérer de près
    quadrant-2 Satisfaire — Tenir informé
    quadrant-3 Surveiller
    quadrant-4 Informer régulièrement
    Jury M2: [0.82, 0.95]
    Commanditaire formation: [0.60, 0.90]
    Figma Platform: [0.35, 0.88]
    Designer early adopter: [0.95, 0.55]
    UX Designers: [0.84, 0.30]
    Communauté Figma: [0.75, 0.28]
    Packaging Designers: [0.65, 0.22]
    Illustrateurs vectoriels: [0.58, 0.20]
    OpenAI: [0.18, 0.52]
    Railway / Supabase: [0.12, 0.45]
    Figma Branches concurrent: [0.30, 0.65]
```

---

## Description des acteurs

### Quadrant 1 — Gérer de près (Fort intérêt + Forte influence)

| Acteur | Rôle | Attentes | Statut |
|---|---|---|---|
| **Jury M2** | Évalue et valide la certification RNCP 39583 | Produit fonctionnel, documentation complète, démo convaincante | Oral BC01 : 8-19 juin 2026 |
| **Designer early adopter** | Premier utilisateur réel — UX/UI designer indépendant | Plugin stable, diff précis, UX intuitive, isolation correcte | Actif depuis mai 2026 ✅ |

### Quadrant 2 — Satisfaire (Faible intérêt + Forte influence)

| Acteur | Rôle | Attentes | Statut |
|---|---|---|---|
| **Commanditaire formation** | École / organisme de formation — valide le projet M2 | Respect du cahier des charges BC01-BC04, livrables complets | Évaluation en cours |
| **Figma Platform** | Fournit l'API Plugin, contrôle la distribution via le Plugin Store | Respect des règles du Plugin Store, politique réseau (`networkAccess`), pas de violation CGU | Approuvé mai 2026 ✅ |
| **Figma Branches (concurrent)** | Concurrent direct à 45$/mois/user — plan Organization uniquement | — (surveillance concurrentielle) | Design Guardian disponible Free |

### Quadrant 3 — Surveiller (Faible intérêt + Faible influence)

| Acteur | Rôle | Attentes | Statut |
|---|---|---|---|
| **OpenAI** | Fournit l'API LLM pour l'AI Patch Note (`gpt-4o-mini`) | SLA, quotas, pricing stables | API stable — dépendance externe |
| **Railway / Supabase** | Infrastructure hébergement + BDD + Storage | Disponibilité, free tier suffisant pour MVP | Railway green ✅ — Supabase Storage actif ✅ |

### Quadrant 4 — Informer (Fort intérêt + Faible influence)

| Acteur | Rôle | Attentes | Statut |
|---|---|---|---|
| **UX Designers** | Utilisateurs finaux principaux | Diff précis, branches accessibles, prix Free/Pro | Cible principale |
| **Communauté Figma** | Utilisateurs découvrant le plugin via Figma Community | Installation simple, onboarding clair | Disponible publiquement ✅ |
| **Packaging Designers** | Utilisateurs vectoriels spécialisés | Support nodes vectoriels, diff vectorPaths | Cible validée par early adopter |
| **Illustrateurs vectoriels** | Cible élargie identifiée | Diff vectorPaths précis au pixel | Cible secondaire |

---

## Flux de communication

```mermaid
flowchart TD
    Dev["Développeur\n(candidat M2)"]

    Dev -->|"Démo live + livrables BC01-BC04"| Jury["Jury M2\nOral juin 2026"]
    Dev -->|"Respect cahier des charges"| Forma["Commanditaire\nFormation"]
    Dev -->|"Soumission Plugin Store\n→ Approuvé mai 2026"| Figma["Figma Platform"]
    Dev -->|"Accès beta + feedback terrain"| Early["Designer\nearly adopter\n(actif ✅)"]
    Dev -->|"Appels API gpt-4o-mini"| OpenAI["OpenAI"]
    Dev -->|"Deploy Railway\nSupabase Storage"| Infra["Railway\nSupabase"]
    Figma -->|"Distribution\nFigma Community"| Users["UX / Packaging\nDesigners"]

    Early -->|"Retours terrain\nbugs, UX, isolation"| Dev
    Figma -->|"Approbation ✅\nMai 2026"| Dev
    Jury -->|"Validation\nRNCP 39583"| Dev
    Forma -->|"Validation\nBC01-BC04"| Dev
```

---

## Analyse différentielle vs concurrent Figma Branches

| Critère | Figma Branches | Design Guardian |
|---|---|---|
| Prix | 45 $/mois/user (Organization) | Free (MVP) |
| Diff géométrique | ❌ Snapshot visuel uniquement | ✅ Précision 0.01px |
| Attribution par élément | ❌ | ✅ Author par node |
| AI Patch Note | ❌ | ✅ GPT-4o-mini |
| Gold status | ❌ | ✅ Workflow approval |
| Accès | Plan Organization uniquement | Tout utilisateur Figma |
