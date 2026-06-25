# C1.2.3 — Cartographie des Risques — Design Guardian

## Matrice de criticité 5×5 (Probabilité × Impact)

> **Échelle complète 1-5 sur les deux axes.** Criticité = P × I → de **1 à 25**.
> Bandes : 🟢 **Faible** 1-4 · 🟡 **Modérée** 5-9 · 🟠 **Élevée** 10-14 · 🔴 **Critique** 15-25.
> → À construire en **tableau Canva natif 5×5, cellules colorées** (la vraie matrice de criticité). Chaque risque est placé dans sa case (valeur = P × I) ; le tableau ci-dessous reprend **exactement** les mêmes valeurs (zéro conflit graph/tableau).

| Impact ↓ \ Proba → | **P1** | **P2** | **P3** | **P4** | **P5** |
|---|:---:|:---:|:---:|:---:|:---:|
| **I5** | 🟡 5 · **R06** | 🟠 10 · **R01** | 🔴 15 | 🔴 20 · **R03** | 🔴 25 |
| **I4** | 🟢 4 | 🟡 8 · **R05** | 🟠 12 · **R02** | 🔴 16 | 🔴 20 |
| **I3** | 🟢 3 | 🟡 6 · **R04** | 🟡 9 | 🟠 12 | 🔴 15 |
| **I2** | 🟢 2 | 🟢 4 | 🟡 6 | 🟡 8 | 🟠 10 |
| **I1** | 🟢 1 | 🟢 2 | 🟢 3 | 🟢 4 | 🟡 5 |

> **Lecture** : R03 (adoption faible) = **4 × 5 = 20** → 🔴 Critique, le risque n°1, loin devant les risques techniques. Le max théorique est **25**.

---

## Référentiel des risques actifs

| ID | Risque | Probabilité | Impact | Criticité (P×I, /25) | Mitigation |
|----|--------|:-----------:|:------:|-----------|------------|
| R03 | Adoption faible au lancement | 4 | 5 | 🔴 Critique (20) | Early adopter actif (mai 2026) · plugin public Figma Community · onboarding à venir |
| R02 | Rupture / changement de l'API Plugin Figma | 3 | 4 | 🟠 Élevée (12) | APIs stables documentées uniquement · veille active du changelog Figma (déjà vécu : `exportAsync`, sprint 2) |
| R01 | Figma sort un versioning natif | 2 | 5 | 🟠 Élevée (10) | Différenciation prix (Branches 45 €/mois/user vs DG Free) · diff 0,01px · AI Patch Note |
| R05 | Dépendance infra (Railway / Supabase) | 2 | 4 | 🟡 Modérée (8) | Health checks `/health` · `/ping` + UptimeRobot 5 min · rollback Railway en 1 clic |
| R04 | Quota / coût OpenAI dépassé | 2 | 3 | 🟡 Modérée (6) | Rate limiting backend · fallback `ai_summary = null` si quota atteint |
| R06 | Perte de données (snapshot manquant) | 1 | 5 | 🟡 Modérée (5) | Sauvegarde Storage + INSERT atomique · `snapshot_json` nullable géré par `resolveSnapshot()` |

> **Bandes de criticité** (P×I sur 25) : 🟢 Faible 1-4 · 🟡 Modérée 5-9 · 🟠 Élevée 10-14 · 🔴 Critique 15-25.
> **Re-cotation** (retour prof) : l'adoption faible (R03) passe à **proba 4** — pour un produit de niche au lancement, c'est hautement probable → criticité **20/25**, et l'échelle utilise enfin le haut de la grille.

> **Indicateurs de contrôle** (pour repérer un risque tôt) :
> - 🟢 **Disponibilité** → `/health` + `/ping` (sonde UptimeRobot 5 min) — *l'infra est-elle debout ?*
> - ⚡ **Performance** → latence + taux d'erreur API (Grafana) — *y a-t-il une dégradation ?*
> - 🧪 **Qualité** → couverture de tests ≥ 80 % — *risque de régression maîtrisé ?*
>
> Chaque indicateur a un **seuil d'alerte** (ex. dispo < 99,5 %, erreurs > 1 %) → on agit **avant** que le risque devienne incident.

---

## Workflow de traitement d'un risque

```mermaid
flowchart TD
    A["Risque détecté"] --> B{"Criticité ?"}
    B -->|"🔴 Critique (15-25)"| C["Traitement immédiat<br/>< 4h"]
    B -->|"🟠 Élevée (10-14)"| D["Traitement planifié<br/>< 24h"]
    B -->|"🟡 Modérée (5-9)"| E["Backlog prioritaire<br/>< 1 semaine"]
    B -->|"🟢 Faible (1-4)"| F["Backlog standard<br/>Prochain sprint"]

    C --> G["Hotfix branch<br/>+ PR review<br/>+ deploy Railway"]
    D --> G
    E --> H["Issue GitHub<br/>+ estimation<br/>+ sprint planning"]
    F --> H

    G --> I["Tests non-régression<br/>+ monitoring 24h<br/>+ clôture incident"]
    H --> I
```

---

## Risques matérialisés et résolus

Ces risques se sont concrétisés en cours de projet et ont été traités — détail dans `DEBLOCAGES.md`.

| ID | Risque matérialisé | Sprint | Impact réel | Résolution | Commit |
|---|---|---|---|---|---|
| R-M01 | `exportAsync` indisponible — plugin ne chargeait pas | Sprint 2 | Bloquant | Abandon → propriétés natives Figma (`absoluteTransform`, `fills`, `vectorPaths`) | `2076ca8` |
| R-M02 | Zod schema supprimait les champs silencieusement | Sprint 3 | Textes et effets jamais capturés | Ajout des champs manquants (`characters`, `effects`, `rotation`, `visible`) | `a0126b0` |
| R-M03 | data URI trop grande pour le webview Figma | Sprint 4 | Frame view inutilisable | Remplacement `<img>` par `dangerouslySetInnerHTML` + `atob()` | `da85c8d` |
| R-M04 | `figma.mixed` Symbol non sérialisable | Sprint 4 | Crash sur nodes complexes | Guards `safeNum()` / `safeStr()` | `14df015` |
| R-M05 | Branches = labels sans isolation réelle | Sprint 5 | Toutes les branches écrasaient le même canvas | Branches = pages Figma dédiées `dg/branchName` | `9f6da16` |
| R-M06 | `snapshot_json` dans PostgreSQL — saturation à l'échelle | Sprint 7 | 200-600 KB/commit en base, non scalable | Migration 008 — Supabase Storage bucket `snapshots` | `c354c46` |
| R-M07 | `figma.fileKey` null → collision de projets inter-utilisateurs | Sprint 7 | Tous les fichiers locaux partageaient le même projet | Blocage explicite avec message d'erreur si `fileKey` absent | `1075f02` |
| R-M08 | Supabase free tier pause → backend injoignable | Sprint 7 | Plugin inaccessible, rejet Figma Community | Endpoint `/ping` + UptimeRobot 5min — base maintenue active | `8403ca0` |
| R04 | Plugin Store refus Figma | Sprint 7 | Délai d'un mois, premier rejet | Correction manifest `networkAccess`, fix Railway build | Approuvé mai 2026 ✅ |
