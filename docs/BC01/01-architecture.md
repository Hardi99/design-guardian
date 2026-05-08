# C1.5 — Architecture Logicielle — Design Guardian

## 1. Architecture globale des microservices

```mermaid
graph TB
    subgraph Plugin["Plugin Figma (Preact + Tailwind)"]
        UI["UI Thread — ui.tsx\nAppels HTTP, rendu timeline"]
        Main["Main Thread — main.ts\nAPI Figma uniquement"]
    end

    subgraph Backend["Backend (Hono + Node.js / Railway)"]
        API["API REST\n/api/checkpoints\n/api/branches\n/api/assets\n/api/projects\n/health · /ping · /metrics"]
        DiffSvc["DiffService\nDiff géométrique ε=0.01px"]
        OpenAISvc["OpenAIService\nAI Patch Note"]
        SVGSvc["SVGService\nReconstruction SVG inline"]
    end

    subgraph Data["Persistance (Supabase)"]
        DB[("PostgreSQL\nprojects · assets · versions")]
        Storage["Storage\nSnapshots JSON\n{asset_id}/v{n}.json"]
    end

    subgraph Monitoring["Monitoring"]
        Prometheus["Prometheus\nscrape /metrics"]
        Grafana["Grafana\nDashboard"]
    end

    subgraph CI["CI/CD"]
        GH["GitHub Actions\nbuild · typecheck · tests · coverage"]
    end

    Main -->|"extractSnapshot()\nabsoluteTransform, fills,\nvectorPaths, children"| UI
    UI -->|"postMessage CAPTURE_CHECKPOINT"| Main
    UI -->|"HTTPS POST /api/checkpoints\n{snapshot_json, branch, author}"| API
    API --> DiffSvc
    DiffSvc -->|"DeltaJSON"| OpenAISvc
    OpenAISvc -->|"ai_summary"| API
    API --> SVGSvc
    API -->|"INSERT metadata\nstorage_path"| DB
    API -->|"UPLOAD snapshot\n{asset_id}/v{n}.json"| Storage
    API -->|"DOWNLOAD prev snapshot"| Storage
    Prometheus -->|"scrape /metrics"| API
    Grafana -->|"query"| Prometheus
    GH -->|"deploy on push"| Backend
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
    Main->>PluginUI: postMessage(SNAPSHOT_READY, snapshot_json)
    PluginUI->>Backend: POST /api/checkpoints {snapshot_json, branch, author}
    Backend->>DB: SELECT id, version_number, storage_path (dernière version)
    DB-->>Backend: {prev.storage_path}
    Backend->>Storage: DOWNLOAD {asset_id}/v{prev}.json
    Storage-->>Backend: prev_snapshot
    Backend->>Backend: DiffService.compareSnapshots(prev, new)
    Note over Backend: flattenTree() → Map id/node<br/>Removed / Added / Modified<br/>Tolérance ε = 0.01px → DeltaJSON
    Backend->>OpenAI: generatePatchNote(deltaJSON, author)
    OpenAI-->>Backend: ai_summary (texte lisible)
    Backend->>Storage: UPLOAD {asset_id}/v{new}.json
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
    Backend->>Storage: DOWNLOAD snapshot courant
    Backend->>Storage: DOWNLOAD snapshot parent
    Storage-->>Backend: current_snap, prev_snap
    Backend->>Backend: SVGService.generateSvgFromSnapshot(current)
    Backend->>Backend: SVGService.generateSvgFromSnapshot(prev)
    Backend->>Backend: node-level SVGs pour chaque nœud du delta
    Backend-->>PluginUI: {svg_b64, prev_svg_b64, node_diffs[]}
    PluginUI-->>Designer: Diff Viewer — Split / Overlay / Nodes
    Note over Designer,PluginUI: Split : côte à côte avant | après<br/>Overlay : superposition avec opacité<br/>Nodes : liste des changements card par card
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
    Types --> Tests["Vitest\n63 tests unitaires"]
    Tests --> Coverage["Coverage gate\n≥ 80%"]
    Coverage --> Deploy["Deploy\nRailway auto-deploy"]
    Deploy --> Health["Health check\n/health · /ping"]

    style Coverage fill:#dcfce7,stroke:#16a34a
    style Deploy fill:#dbeafe,stroke:#2563eb
```
