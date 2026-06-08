# C1.5 — Architecture Logicielle — Design Guardian

## 1. Architecture globale — Vue macro

```mermaid
graph TB
    Designer(["👤 Designer<br/>Figma Desktop"])

    subgraph Plugin["Plugin Figma · Preact + Tailwind"]
        direction LR
        Main["main.ts<br/>API Figma"]
        UIThread["ui.tsx<br/>Interface + HTTP"]
        Main <-->|postMessage| UIThread
    end

    subgraph Backend["API Backend · HonoJS · Railway"]
        direction LR
        Auth["Auth<br/>OAuth · JWT"]
        Core["Checkpoints · Diff · IA<br/>Branches · Assets"]
        Payments["Paiements<br/>Stripe"]
        Notifs["Notifications<br/>Resend · Twilio"]
        Metrics["Métriques<br/>Prometheus /metrics"]
    end

    subgraph Data["Supabase"]
        DB[("PostgreSQL")]
        Storage["Storage<br/>Snapshots JSON"]
    end

    OpenAI["🤖 OpenAI<br/>GPT-4o-mini"]
    StripeAPI["💳 Stripe"]
    Monitoring["📊 Prometheus · Grafana"]
    CI["⚙️ GitHub Actions<br/>CI/CD · Tests"]

    Designer -->|"API Figma<br/>(main thread)"| Main
    UIThread -->|"HTTPS · X-API-Key"| Backend
    Backend --> Data
    Core --> OpenAI
    Payments --> StripeAPI
    StripeAPI -->|"webhook signé"| Payments
    Notifs -->|"email + SMS"| UIThread
    Monitoring -->|"scrape /metrics"| Metrics
    CI ==>|"deploy on push"| Core
```

> **Légende** — ▭ service / composant · ⬡ service externe · `→` flux de données · `↔` échange bidirectionnel · couleurs = regroupement logique (Plugin / Backend / Data).
>
> **Formalisme** — vue type **C4 « Container »** : un conteneur = une unité déployable, ses services internes = modules. Le **backend Hono = 1 déploiement, 6 services modulaires** (Auth · BDD · Métriques · Notifications · IA · Paiements) — découpage prêt à extraire en microservices si la charge l'exige.
>
> **Sécurité** — Plugin → Backend en `HTTPS` + `X-API-Key` · Auth `JWT / OAuth` · webhooks Stripe signés.
>
> **Éco-conception** — propriétés natives Figma (zéro parsing SVG lourd) · snapshots déportés en Supabase Storage (PostgreSQL allégé) · modèle `gpt-4o-mini` (faible empreinte) · hébergement free tier (ressources minimales).

---

## 1bis. Sécurité · Éco-conception · Extensibilité (vue C1.5 — slide 18)

> Ces 3 blocs couvrent les exigences C1.5 que ni le schéma macro ni les diagrammes de séquence ne montrent : **architecture sécurisée**, **impact environnemental**, **maintenable & extensible**.

### 🔒 Sécurité
- Plugin → Backend en **HTTPS + `X-API-Key`**
- Auth **JWT / OAuth** · token stocké dans `figma.clientStorage`
- Webhooks **Stripe signés** · **RLS Supabase** (row-level security)

### 🌱 Éco-conception
- **Propriétés natives** Figma → zéro parsing SVG lourd (moins de CPU)
- Snapshots déportés en **Supabase Storage** → PostgreSQL allégé
- **`gpt-4o-mini`** (petit modèle) · hébergement **free tier** (pas de sur-provisionnement)

### 🧩 Maintenable & extensible
- **6 services modulaires** (Auth · BDD · Métriques · Notifications · IA · Paiements)
- Monolithe modulaire → **prêt à extraire en microservices** si la charge monte
- **TypeScript bout en bout** · séparation Service / Controller · arbre `parent_id` (CTE récursifs)

> **💳 Roadmap paiement (réponse à l'objection TVA EU)** : **Stripe** pour le MVP (intégration rapide, webhooks signés). Passage à un **Merchant of Record** (Lemon Squeezy / Paddle) prévu pour la **commercialisation**, afin d'**automatiser la TVA EU** — Stripe ne gère pas la TVA en tant que MoR. → Choix MVP assumé, évolution produit anticipée.

---

## 2. Diagramme de séquence — Capture d'un checkpoint

```mermaid
sequenceDiagram
    actor Designer
    participant PluginUI as Plugin UI (ui.tsx)
    participant Main as main.ts (Figma thread)
    participant Backend as Backend (Hono / Railway)
    participant Storage as Supabase Storage
    participant DB as Supabase PostgreSQL
    participant OpenAI as OpenAI API

    Designer->>PluginUI: Clic "Capture Checkpoint"
    PluginUI->>Main: postMessage(CAPTURE_SNAPSHOT)
    Main->>Main: extractSnapshot(selectedNode)
    Note over Main: Parcours récursif du node tree<br/>absoluteTransform → x, y absolus<br/>fills, strokes, effects, opacity<br/>vectorPaths, cornerRadius, characters<br/>safeNum() pour figma.mixed
    Main->>Main: node.exportAsync({ format: 'SVG' }) → render_svg_b64
    Note over Main: SVG natif Figma (pixel-perfect)<br/>capturé tel quel, aucune reconstruction
    Main->>PluginUI: postMessage(SNAPSHOT_READY, snapshot_json + render_svg_b64)
    PluginUI->>Backend: POST /api/checkpoints {snapshot_json, render_svg_b64, branch, author}
    Backend->>DB: SELECT id, version_number, storage_path (dernière version)
    DB-->>Backend: {prev.storage_path}
    Backend->>Storage: DOWNLOAD {asset_id}/v{prev}.json
    Storage-->>Backend: prev_snapshot
    Backend->>Backend: DiffService.compareSnapshots(prev, new)
    Note over Backend: flattenTree() → Map id/node<br/>Removed / Added / Modified<br/>Tolérance ε = 0.01px → DeltaJSON
    Backend->>OpenAI: generatePatchNote(deltaJSON, author)
    OpenAI-->>Backend: ai_summary (texte lisible)
    Backend->>Storage: UPLOAD {asset_id}/{branch}/v{new}.json + render_svg natif
    Storage-->>Backend: storage_path
    Backend->>DB: INSERT versions {storage_path, analysis_json, ai_summary, parent_id}
    DB-->>Backend: {version_id}
    Backend-->>PluginUI: {version, analysis, ai_summary}
    PluginUI-->>Designer: Timeline mise à jour ✅
```

---

## 3. Diagramme de séquence — Affichage d'un diff

```mermaid
sequenceDiagram
    actor Designer
    participant PluginUI as Plugin UI
    participant Backend as Backend
    participant Storage as Supabase Storage
    participant DB as Supabase PostgreSQL

    Designer->>PluginUI: Clic sur une version dans la timeline
    PluginUI->>Backend: GET /api/branches/versions/{id}
    Backend->>DB: SELECT version + parent_id
    DB-->>Backend: {version, parent_id, storage_path}
    Backend->>Storage: DOWNLOAD render_svg natif (version courante)
    Backend->>Storage: DOWNLOAD render_svg natif (version parent)
    Storage-->>Backend: current_svg, prev_svg
    Note over Backend: SVG exporté nativement par Figma (exportAsync)<br/>au moment du checkpoint — aucune reconstruction
    Backend->>DB: SELECT analysis_json (delta pré-calculé)
    DB-->>Backend: node_diffs[]
    Backend-->>PluginUI: {svg_b64, prev_svg_b64, node_diffs[]}
    PluginUI-->>Designer: Diff Viewer — Split / Overlay / Nodes
    Note over Designer,PluginUI: Split : côte à côte avant | après<br/>Overlay : superposition + mode Différence<br/>Nodes : liste des changements card par card
```

---

## 4. Schéma de la base de données (Supabase / PostgreSQL)

```mermaid
erDiagram
    projects {
        uuid id PK
        text name
        text description
        text figma_file_key UK
        text api_key UK
        text plan
        text stripe_customer_id
        text stripe_subscription_id
        text notify_email
        timestamp created_at
    }

    assets {
        uuid id PK
        uuid project_id FK
        text name
        text description
        text asset_type
        timestamp created_at
    }

    versions {
        uuid id PK
        uuid asset_id FK
        uuid parent_id FK
        text branch_name
        int version_number
        text author_figma_id
        text author_name
        text author_avatar_url
        text figma_node_id
        jsonb snapshot_json
        text storage_path
        jsonb analysis_json
        text ai_summary
        text status
        text approved_by
        timestamp approved_at
        timestamp created_at
    }

    projects ||--o{ assets : "contient"
    assets ||--o{ versions : "historique"
    versions ||--o{ versions : "parent_id (arbre branches)"
```

> **Note migration 008** : `snapshot_json` est nullable depuis la migration 008.
> Les nouvelles versions ont `snapshot_json = null` et `storage_path` renseigné.
> Les anciennes versions (pré-migration) conservent leur `snapshot_json` en base.
> `resolveSnapshot()` gère les deux cas de façon transparente.

---

## 5. Architecture double thread Figma

```mermaid
graph LR
    subgraph FigmaDesktop["Figma Desktop"]
        subgraph MainThread["Main Thread — main.ts"]
            FigmaAPI["figma.fileKey<br/>figma.currentUser<br/>figma.currentPage<br/>node.absoluteTransform<br/>node.fills · node.effects<br/>node.vectorPaths<br/>figma.createPage()"]
        end
        subgraph UIThread["UI Thread — ui.tsx (Webview)"]
            Preact["Preact + Tailwind<br/>Timeline · DiffViewer<br/>Checkpoint · Branches<br/>Gold status"]
            HTTP["fetch() HTTPS<br/>X-API-Key header"]
        end
    end

    MainThread <-->|"figma.ui.postMessage<br/>figma.ui.onmessage"| UIThread
    HTTP -->|"HTTPS Railway"| BackendAPI["Backend<br/>Hono + Node.js<br/>Railway"]

    style MainThread fill:#f0f9ff,stroke:#0ea5e9
    style UIThread fill:#fef9f0,stroke:#f59e0b
```

> **Règle critique** : `figma.*` est accessible **uniquement** dans le main thread.
> Les appels HTTP n'existent **uniquement** dans le UI thread. Communication par `postMessage`.

---

## 6. Pipeline CI/CD

```mermaid
graph LR
    Commit["git push<br/>master"] --> Build["Build<br/>tsc / vite build"]
    Build --> Types["Typecheck<br/>tsc --noEmit"]
    Types --> Tests["Vitest<br/>123 tests (63 back · 60 plugin)"]
    Tests --> Coverage["Coverage gate<br/>≥ 80%"]
    Coverage --> Deploy["Deploy<br/>Railway auto-deploy"]
    Deploy --> Health["Health check<br/>/health · /ping"]

    style Coverage fill:#dcfce7,stroke:#16a34a
    style Deploy fill:#dbeafe,stroke:#2563eb
```
