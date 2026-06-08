# Gantt condensé — Design Guardian (preview VS Code → PNG)

> Aperçu : `Ctrl+Shift+V` (extension « Markdown Preview Mermaid Support »).
> Export PNG : clic droit sur le diagramme dans l'aperçu, ou via mermaid.live.

```mermaid
gantt
    title Design Guardian — Planning (Jan → Juin 2026)
    dateFormat YYYY-MM-DD
    axisFormat %d %b

    section Exploration
    Cadrage · exploration SaaS           :done, 2026-01-12, 2026-02-27
    Pivot SaaS vers Plugin               :milestone, 2026-03-02, 0d
    section Cadrage
    S0 · Cadrage · faisabilité · archi   :done, 2026-03-02, 2026-03-09
    section Fondations
    S1 · Railway · Supabase · BDD        :done, 2026-03-09, 2026-03-20
    section Plugin MVP
    S2 · Snapshot natif · checkpoint     :done, 2026-03-20, 2026-04-03
    section Diff Engine
    S3 · DiffService · 63 tests          :done, 2026-04-03, 2026-04-17
    section IA & Viewer
    S4 · AI Patch Note · Diff Viewer     :done, 2026-04-17, 2026-05-01
    section Features
    S5 · Branches · Gold · Restore       :done, 2026-05-01, 2026-05-11
    section Qualité & Infra
    S6 · CI/CD · Prometheus · Grafana    :done, 2026-05-11, 2026-05-18
    section Production
    S7 · Migration Storage · Figma Store :done, 2026-05-18, 2026-05-25
    Approbation Figma Community          :milestone, 2026-05-25, 0d
    section Soutenance
    S8 · Refacto · 60 tests · deck       :active, 2026-05-25, 2026-06-12
    Oral BC01                            :milestone, 2026-06-13, 0d
```
