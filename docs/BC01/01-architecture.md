# C1.5 — Architecture Logicielle — Design Guardian

## 1. Architecture globale — Vue macro

```mermaid
graph TB
    Designer(["👤 Designer\nFigma Desktop"])

    subgraph Plugin["Plugin Figma · Preact + Tailwind"]
        direction LR
        Main["main.ts\nAPI Figma"]
        UIThread["ui.tsx\nInterface + HTTP"]
        Main <-->|postMessage| UIThread
    end

    subgraph Backend["API Backend · HonoJS · Railway"]
        direction LR
        Auth["Auth\nOAuth · JWT"]
        Core["Checkpoints · Diff · IA\nBranches · Assets"]
        Payments["Paiements\nStripe"]
        Notifs["Notifications\nResend · Twilio"]
        Metrics["Métriques\nPrometheus /metrics"]
    end

    subgraph Data["Supabase"]
        DB[("PostgreSQL")]
        Storage["Storage\nSnapshots JSON"]
    end

    OpenAI["🤖 OpenAI\nGPT-4o-mini"]
    StripeAPI["💳 Stripe"]
    Monitoring["📊 Prometheus · Grafana"]
    CI["⚙️ GitHub Actions\nCI/CD · Tests"]

    Designer -->|"API Figma\n(main thread)"| Main
    UIThread -->|"HTTPS · X-API-Key"| Backend
    Backend --> Data
    Core --> OpenAI
    Payments --> StripeAPI
    StripeAPI -->|"webhook signé"| Payments
    Notifs -->|"email + SMS"| UIThread
    Monitoring -->|"scrape /metrics"| Metrics
    CI ==>|"deploy on push"| Core
```

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
            FigmaAPI["figma.fileKey\nfigma.currentUser\nfigma.currentPage\nnode.absoluteTransform\nnode.fills · node.effects\nnode.vectorPaths\nfigma.createPage()"]
        end
        subgraph UIThread["UI Thread — ui.tsx (Webview)"]
            Preact["Preact + Tailwind\nTimeline · DiffViewer\nCheckpoint · Branches\nGold status"]
            HTTP["fetch() HTTPS\nX-API-Key header"]
        end
    end

    MainThread <-->|"figma.ui.postMessage\nfigma.ui.onmessage"| UIThread
    HTTP -->|"HTTPS Railway"| BackendAPI["Backend\nHono + Node.js\nRailway"]

    style MainThread fill:#f0f9ff,stroke:#0ea5e9
    style UIThread fill:#fef9f0,stroke:#f59e0b
```

> **Règle critique** : `figma.*` est accessible **uniquement** dans le main thread.
> Les appels HTTP n'existent **uniquement** dans le UI thread. Communication par `postMessage`.

---

## 6. Pipeline CI/CD

```mermaid
graph LR
    Commit["git push\nmaster"] --> Build["Build\ntsc / vite build"]
    Build --> Types["Typecheck\ntsc --noEmit"]
    Types --> Tests["Vitest\n123 tests (63 back · 60 plugin)"]
    Tests --> Coverage["Coverage gate\n≥ 80%"]
    Coverage --> Deploy["Deploy\nRailway auto-deploy"]
    Deploy --> Health["Health check\n/health · /ping"]

    style Coverage fill:#dcfce7,stroke:#16a34a
    style Deploy fill:#dbeafe,stroke:#2563eb
```
