# Design Guardian CLI

> Outil en ligne de commande pour comparer des fichiers SVG et détecter les changements géométriques.

## Installation

```bash
cd cli
npm install
npm run build
npm link  # Rend la commande `dg` disponible globalement
```

## Commandes

### `dg compare <file1> <file2>`

Compare deux fichiers SVG et affiche les différences géométriques.

```bash
# Comparaison standard avec sortie colorée
dg compare logo-v1.svg logo-v2.svg

# Sortie JSON (idéal pour CI/CD)
dg compare logo-v1.svg logo-v2.svg --json

# Afficher uniquement le résumé
dg compare logo-v1.svg logo-v2.svg --quiet
```

**Options :**
| Option | Description |
|--------|-------------|
| `-j, --json` | Sortie au format JSON |
| `-q, --quiet` | Affiche uniquement le résumé |

**Codes de sortie :**
| Code | Signification |
|------|---------------|
| `0` | Aucune différence détectée |
| `1` | Différences détectées |

**Exemple de sortie :**
```
Design Guardian — Comparison Report
──────────────────────────────────────────────────

V1: logo-v1.svg
V2: logo-v2.svg

⚠ 3 changement(s): 1 modif. géométrique(s), 2 attribut(s) changé(s)

Changes:

  ● path_1 ~ Geometry (2.5px)
  ● rect_2 ~ Attribute fill: #FF0000 → #FF5500
  ● circle_3 ~ Attribute opacity: 1 → 0.8
```

---

### `dg info <file>`

Affiche les informations d'un fichier SVG.

```bash
dg info logo.svg
```

**Exemple de sortie :**
```
SVG Info: logo.svg
────────────────────────────────────

Size: 100 × 100
Elements: 5

  • path: 2
  • rect: 1
  • circle: 1
  • text: 1
```

---

## Intégration CI/CD

### GitHub Actions

```yaml
name: SVG Diff Check

on:
  pull_request:
    paths:
      - '**.svg'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install CLI
        run: |
          cd cli
          npm ci
          npm run build

      - name: Compare changed SVGs
        run: |
          for file in $(git diff --name-only HEAD~1 -- '*.svg'); do
            if git show HEAD~1:$file > /tmp/old.svg 2>/dev/null; then
              echo "Comparing $file..."
              node cli/dist/index.js compare /tmp/old.svg $file --json
            fi
          done
```

### GitLab CI

```yaml
svg-diff:
  image: node:20
  script:
    - cd cli && npm ci && npm run build
    - node dist/index.js compare old.svg new.svg --json
  only:
    changes:
      - "**/*.svg"
```

---

## Types de changements détectés

| Type | Sévérité | Description |
|------|----------|-------------|
| `added` | Major | Nouvel élément ajouté |
| `removed` | Major | Élément supprimé |
| `geometry_modified` | Variable | Forme modifiée (points, courbes) |
| `attribute_changed` | Variable | Attribut modifié (fill, stroke, etc.) |

### Niveaux de sévérité

- **Major** : Changement structurel (ajout/suppression d'éléments, déplacement > 5px)
- **Moderate** : Changement visuel (couleur, opacité, déplacement 1-5px)
- **Minor** : Micro-ajustement (< 1px, attributs non visuels)

---

## Développement

```bash
# Mode développement avec watch
npm run dev

# Build
npm run build

# Lancer sans build
npx tsx src/index.ts compare file1.svg file2.svg
```

## Licence

MIT
