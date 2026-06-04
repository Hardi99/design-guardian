# C1.4.1 — Charge de travail & Planning — Design Guardian

## Diagramme de Gantt — Sprints du projet

```mermaid
gantt
    title Design Guardian - Planning Projet Oct 2024 - Juin 2026
    dateFormat YYYY-MM-DD
    excludes weekends

    section Sprint 0 Cadrage
        Analyse du besoin et contexte          :done, s0a, 2024-10-01, 2024-10-14
        Etude de faisabilite technique         :done, s0b, 2024-10-07, 2024-10-21
        Architecture cible et choix stack      :done, s0c, 2024-10-14, 2024-10-28

    section Sprint 1 Fondations
        Setup Railway et Supabase              :done, s1a, 2024-10-28, 2024-11-11
        Schema BDD versions et branches        :done, s1b, 2024-11-04, 2024-11-18
        Plugin scaffold create-figma-plugin    :done, s1c, 2024-11-11, 2024-11-25

    section Sprint 2 Plugin MVP
        Extraction snapshot natif Figma        :done, s2a, 2024-11-25, 2024-12-09
        Abandon exportAsync, proprietes natives :done, s2b, 2024-12-02, 2024-12-16
        Premier checkpoint fonctionnel         :done, s2c, 2024-12-09, 2024-12-23

    section Sprint 3 Diff Engine
        DiffService algorithme geometrique     :done, s3a, 2025-01-06, 2025-01-27
        63 tests backend Vitest                :done, s3b, 2025-01-20, 2025-02-10
        Fix Zod schema champs silencieux       :done, s3c, 2025-01-27, 2025-02-03

    section Sprint 4 IA et Viewer
        AI Patch Note via OpenAI               :done, s4a, 2025-02-10, 2025-02-24
        Diff Viewer Split / Overlay / Nodes    :done, s4b, 2025-02-17, 2025-03-10
        Fix SVG data URI vers inline           :done, s4c, 2025-03-03, 2025-03-17

    section Sprint 5 Features avancees
        Branches isolation via pages Figma     :done, s5a, 2025-03-17, 2025-04-07
        Gold status et Timeline                :done, s5b, 2025-03-31, 2025-04-21
        Restore version                        :done, s5c, 2025-04-14, 2025-04-28

    section Sprint 6 Qualite et Infra
        CI/CD GitHub Actions                   :done, s6a, 2025-05-05, 2025-05-19
        Prometheus et Grafana                  :done, s6b, 2025-05-12, 2025-05-26
        Dependabot et CHANGELOG                :done, s6c, 2025-05-19, 2025-06-02
        Cahier de recettes REC-XXX             :done, s6d, 2025-10-01, 2025-11-15

    section Sprint 7 Scalabilite et Production
        Migration 008 Snapshots vers Storage   :done, s7a, 2026-04-01, 2026-04-15
        Fix Railway build tsc dependencies     :done, s7b, 2026-04-15, 2026-04-20
        Fix isolation figma.fileKey            :done, s7c, 2026-04-20, 2026-04-25
        Soumission Figma Community             :done, s7d, 2026-04-01, 2026-04-10
        Approbation Figma Community            :milestone, figmaok, 2026-05-08, 0d
        Premier utilisateur early adopter      :done, s7e, 2026-05-08, 2026-05-08

    section Sprint 8 Soutenance BC01 BC03
        Diagrammes architecture Mermaid        :done, s8a, 2026-05-08, 2026-05-09
        Refacto plugin et 60 tests Vitest      :done, s8h, 2026-06-01, 2026-06-04
        Planning et roadmap                    :active, s8b, 2026-05-09, 2026-05-12
        Parties prenantes et risques           :s8c, 2026-05-12, 2026-05-16
        Backlog MoSCoW et story points         :s8d, 2026-05-12, 2026-05-19
        Deck BC01 15-20 slides                 :s8e, 2026-05-19, 2026-06-02
        Video Sprint Review 10-15 min          :s8f, 2026-05-26, 2026-06-07
        Preparation oral et repetitions        :s8g, 2026-06-02, 2026-06-07
        Oral BC01 Soutenance M2                :milestone, sout, 2026-06-13, 0d
```

---

## Décomposition des charges par composant

```mermaid
pie title Répartition charge de travail (en %)
    "Plugin Figma (UI + main thread)" : 28
    "Diff Engine (DiffService + tests)" : 18
    "Backend API (Hono + controllers)" : 16
    "SVG Generation & Rendering" : 11
    "Infrastructure (CI/CD + Monitoring)" : 10
    "Scalabilité & Storage migration" : 8
    "Documentation & BC" : 9
```

---

## Fonctionnalités — Hiérarchie MoSCoW

```mermaid
mindmap
  root((Design Guardian))
    Must Have
      Capture checkpoint
      Diff géométrique ε=0.01px
      AI Patch Note
      Timeline des versions
      Branches via pages Figma
    Should Have
      Gold status approval
      Diff Viewer Split/Overlay/Nodes
      Restore version
      Supabase Storage migration
    Could Have
      Figma REST API SVG pixel-perfect
      Modèle économique Lemon Squeezy
      Diff texte mot par mot
      Onboarding tutoriel
    Won't Have MVP
      SDK public
      Export diff PDF
      Notifications Slack
      Multi-sélection nodes
```
