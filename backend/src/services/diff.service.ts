import type {
  FigmaSnapshot,
  NodeSnapshot,
  FigmaColor,
  NodeDelta,
  PropertyChange,
  DeltaJSON,
} from '../types/figma.js';

// Types sans repère propre dans Figma : leurs bornes suivent leurs enfants, qui se mesurent
// donc dans le cadre qui les contient (sinon un enfant qui élargit le groupe « déplace » ses frères).
const COORD_TRANSPARENT = new Set(['GROUP', 'BOOLEAN_OPERATION']);

interface FlatEntry {
  node: NodeSnapshot;               // tel que capturé (coordonnées absolues)
  local: { x: number; y: number };  // position dans le cadre de référence
  parent: NodeSnapshot | null;
  parentKey: string | null;         // clé d'appariement du parent (changement de parent)
  frameKey: string | null;          // clé d'appariement du cadre de référence
}

export class DiffService {
  private readonly EPSILON = 0.01; // px tolerance for geometric comparisons

  compareSnapshots(v1: FigmaSnapshot, v2: FigmaSnapshot): DeltaJSON {
    const startTime = performance.now();

    // Matcher en couches, NŒUD PAR NŒUD : dg_id quand les deux versions le portent (stable —
    // survit clone/rename/réordre/cross-branch) → id Figma (same-branch) → chemin d'arbre
    // (legacy sans dg_id, cross-branch cloné). Ne dépend pas de la racine : un nœud non
    // stampé (viewer read-only) retombe seul sur l'id, sans entraîner le reste.
    const dg1 = this.dgIds(v1.root);
    const dg2 = this.dgIds(v2.root);
    const sameBranch = v1.root.id === v2.root.id;
    const keyer = (other: Set<string>) => (node: NodeSnapshot, path: string): string => {
      if (node.dg_id && other.has(node.dg_id)) return `dg:${node.dg_id}`;
      return sameBranch ? `id:${node.id}` : `path:${path}`;
    };
    const v1Map = this.flatten(v1.root, keyer(dg2));
    const v2Map = this.flatten(v2.root, keyer(dg1));

    const modified: NodeDelta[] = [];
    const added: NodeDelta[] = [];
    const removed: NodeDelta[] = [];

    // Removed: in v1 but not in v2. nodeId = raw Figma id (downstream lookups key on it).
    for (const [key, { node }] of v1Map) {
      if (!v2Map.has(key)) {
        removed.push({ nodeId: node.id, nodeName: node.name, nodeType: node.type, changes: [] });
      }
    }

    // Added: in v2 but not in v1.
    for (const [key, { node }] of v2Map) {
      if (!v1Map.has(key)) {
        added.push({ nodeId: node.id, nodeName: node.name, nodeType: node.type, changes: [] });
      }
    }

    // Modified: in both, compare properties.
    for (const [key, e1] of v1Map) {
      const e2 = v2Map.get(key);
      if (!e2) continue;

      // Position comparée dans un repère COMMUN aux deux versions : le cadre de référence
      // s'il n'a pas changé ; sinon le parent s'il n'a pas changé (enfant d'un groupe
      // déplacé en bloc : il a suivi) ; sinon la position visuelle absolue.
      const sameFrame = e1.frameKey === e2.frameKey;
      const sameParent = e1.parentKey === e2.parentKey;
      const pos = (e: FlatEntry) =>
        sameFrame ? e.local
        : sameParent && e.parent ? this.localPosition(e.node, e.parent)
        : { x: e.node.x, y: e.node.y };
      const v2Node = e2.node;
      const changes = this.compareNodes({ ...e1.node, ...pos(e1) }, { ...v2Node, ...pos(e2) });
      if (!sameParent) {
        const from = e1.parent?.name ?? '—';
        const to = e2.parent?.name ?? '—';
        changes.unshift({ property: 'parent', oldValue: from, newValue: to, delta: `${from} → ${to}` });
      }
      if (changes.length > 0) {
        modified.push({
          nodeId: v2Node.id, nodeName: v2Node.name, nodeType: v2Node.type, changes,
          layoutSizingHorizontal: v2Node.layoutSizingHorizontal,
          layoutSizingVertical: v2Node.layoutSizingVertical,
          layoutPositioning: v2Node.layoutPositioning,
          inAutoLayout: e2.parent?.layoutMode === undefined ? undefined : e2.parent.layoutMode !== 'NONE',
        });
      }
    }

    const endTime = performance.now();

    return {
      modified,
      added,
      removed,
      totalChanges: modified.length + added.length + removed.length,
      metadata: {
        v1CapturedAt: v1.capturedAt,
        v2CapturedAt: v2.capturedAt,
        epsilon: this.EPSILON,
        processingTimeMs: Math.round(endTime - startTime),
      },
    };
  }

  // Aplatit l'arbre en map clé→entrée. La clé est fournie par `keyOf` (matcher en couches).
  // `local` = position dans le cadre de référence (comme le panneau Figma) : les snapshots
  // portent des coordonnées absolues, et comparer l'absolu signalerait tout le contenu
  // d'un cadre déplacé. Parent et cadre sont identifiés par leur clé d'appariement, pour
  // détecter un changement de parent entre versions. La racine garde ses coordonnées.
  private flatten(root: NodeSnapshot, keyOf: (node: NodeSnapshot, path: string) => string): Map<string, FlatEntry> {
    const map = new Map<string, FlatEntry>();
    type Ref = { node: NodeSnapshot; key: string } | null;
    let rootRef: Ref = null;
    const traverse = (node: NodeSnapshot, path: string, parent: Ref, frame: Ref): void => {
      const key = keyOf(node, path);
      map.set(key, {
        node,
        local: frame ? this.localPosition(node, frame.node) : { x: node.x, y: node.y },
        parent: parent?.node ?? null, parentKey: parent?.key ?? null, frameKey: frame?.key ?? null,
      });
      const self = { node, key };
      rootRef ??= self;
      const childFrame = frame && COORD_TRANSPARENT.has(node.type) ? frame : self;
      // Élément flottant : rangé sous la frame qu'il recouvre, mais son vrai parent est la page.
      node.children?.forEach((child, i) => {
        const childPath = `${path}/${i}:${child.type}:${child.name}`;
        if (child.floating) traverse(child, childPath, rootRef, rootRef);
        else traverse(child, childPath, self, childFrame);
      });
    };
    traverse(root, `${root.type}:${root.name}`, null, null);
    return map;
  }

  private dgIds(root: NodeSnapshot): Set<string> {
    const ids = new Set<string>();
    const visit = (n: NodeSnapshot): void => {
      if (n.dg_id) ids.add(n.dg_id);
      n.children?.forEach(visit);
    };
    visit(root);
    return ids;
  }

  // Position de `node` dans le repère de `frame`. `rotation` suit la convention de capture
  // (extractRotation du plugin) : la matrice absolue du repère vaut [[cos r, -sin r], [sin r, cos r]].
  private localPosition(node: NodeSnapshot, frame: NodeSnapshot): { x: number; y: number } {
    const dx = node.x - frame.x;
    const dy = node.y - frame.y;
    const r = ((frame.rotation ?? 0) * Math.PI) / 180;
    if (r === 0) return { x: dx, y: dy };
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return { x: cos * dx + sin * dy, y: -sin * dx + cos * dy };
  }

  private compareNodes(v1: NodeSnapshot, v2: NodeSnapshot): PropertyChange[] {
    const changes: PropertyChange[] = [];

    // Position (dans un repère commun — cf. compareSnapshots)
    this.compareNumeric(changes, 'x', v1.x, v2.x, 'px');
    this.compareNumeric(changes, 'y', v1.y, v2.y, 'px');

    // Dimensions
    this.compareNumeric(changes, 'width', v1.width, v2.width, 'px');
    this.compareNumeric(changes, 'height', v1.height, v2.height, 'px');

    // Opacity
    if (Math.abs(v2.opacity - v1.opacity) > 0.001) {
      changes.push({
        property: 'opacity',
        oldValue: v1.opacity,
        newValue: v2.opacity,
        delta: `${Math.round(v1.opacity * 100)}% -> ${Math.round(v2.opacity * 100)}%`,
      });
    }

    // Corner radius — uniforme ET par-coin. Si les deux côtés sont uniformes, on garde
    // EXACTEMENT le comportement scalaire historique (+X.XXpx). Dès qu'un côté est par-coin
    // (cornerRadii), on normalise en 4-uplet [TL,TR,BR,BL] et on compare coin par coin à ε.
    if (!v1.cornerRadii && !v2.cornerRadii) {
      if (v1.cornerRadius !== undefined && v2.cornerRadius !== undefined) {
        this.compareNumeric(changes, 'cornerRadius', v1.cornerRadius, v2.cornerRadius, 'px');
      }
    } else {
      const r1 = this.cornerTuple(v1);
      const r2 = this.cornerTuple(v2);
      if (r1 && r2) {
        // coin le plus modifié → oldValue/newValue numériques (significance garde son seuil 1px)
        let maxI = -1, maxD = 0;
        for (let i = 0; i < 4; i++) {
          const d = Math.abs((r1[i] ?? 0) - (r2[i] ?? 0));
          if (d > maxD) { maxD = d; maxI = i; }
        }
        if (maxD > this.EPSILON && maxI >= 0) {
          const fmt = (t: number[]) => t.map(n => Number(n.toFixed(2))).join('/');
          changes.push({
            property: 'cornerRadius',
            oldValue: r1[maxI],
            newValue: r2[maxI],
            delta: `${fmt(r1)} → ${fmt(r2)} px`,
          });
        }
      }
    }

    // Stroke weight
    if (v1.strokeWeight !== undefined && v2.strokeWeight !== undefined) {
      this.compareNumeric(changes, 'strokeWeight', v1.strokeWeight, v2.strokeWeight, 'px');
    }

    // Fills — compare all fills, not just the first
    if (v1.fills.length !== v2.fills.length) {
      changes.push({ property: 'fills', oldValue: `${v1.fills.length} fill(s)`, newValue: `${v2.fills.length} fill(s)`, delta: `${v1.fills.length} → ${v2.fills.length}` });
    }
    const fillCount = Math.min(v1.fills.length, v2.fills.length);
    for (let i = 0; i < fillCount; i++) {
      const f1 = v1.fills[i];
      const f2 = v2.fills[i];
      if (!f1 || !f2) continue;
      const label = v1.fills.length > 1 ? `fill[${i}]` : 'fill';
      if (f1.type !== f2.type) {
        changes.push({ property: label, oldValue: f1.type, newValue: f2.type, delta: `${f1.type} → ${f2.type}` });
        continue;
      }
      if (f1.type === 'SOLID' && f2.type === 'SOLID' && f1.color && f2.color && !this.colorsEqual(f1.color, f2.color)) {
        const oldHex = this.colorToHex(f1.color);
        const newHex = this.colorToHex(f2.color);
        changes.push({ property: label, oldValue: oldHex, newValue: newHex, delta: `${oldHex} → ${newHex}` });
      }
      if ((f1.visible ?? true) !== (f2.visible ?? true)) {
        changes.push({ property: `${label}.visible`, oldValue: f1.visible, newValue: f2.visible, delta: f2.visible ? 'masqué → visible' : 'visible → masqué' });
      }
    }

    // Strokes (compare first solid stroke)
    const v1Stroke = v1.strokes.find(s => s.type === 'SOLID' && s.color);
    const v2Stroke = v2.strokes.find(s => s.type === 'SOLID' && s.color);
    if (v1Stroke?.color && v2Stroke?.color && !this.colorsEqual(v1Stroke.color, v2Stroke.color)) {
      const oldHex = this.colorToHex(v1Stroke.color);
      const newHex = this.colorToHex(v2Stroke.color);
      changes.push({ property: 'stroke', oldValue: oldHex, newValue: newHex, delta: `${oldHex} -> ${newHex}` });
    }

    // Vector paths (for VECTOR nodes)
    if (v1.vectorPaths && v2.vectorPaths) {
      const v1Data = v1.vectorPaths.map(p => p.data).join('|');
      const v2Data = v2.vectorPaths.map(p => p.data).join('|');
      if (v1Data !== v2Data) {
        changes.push({ property: 'vectorPaths', oldValue: 'previous', newValue: 'modified', delta: 'Path geometry modified' });
      }
    }

    // Visibility change
    if (v1.visible !== undefined && v2.visible !== undefined && v1.visible !== v2.visible) {
      changes.push({
        property: 'visible',
        oldValue: v1.visible,
        newValue: v2.visible,
        delta: v2.visible ? 'hidden → visible' : 'visible → hidden',
      });
    }

    // Rotation
    if (v1.rotation !== undefined && v2.rotation !== undefined) {
      this.compareNumeric(changes, 'rotation', v1.rotation, v2.rotation, '°');
    }

    // Text content
    if (v1.characters !== undefined && v2.characters !== undefined && v1.characters !== v2.characters) {
      changes.push({ property: 'characters', oldValue: v1.characters, newValue: v2.characters, delta: 'Texte modifié' });
    }

    // Font size
    if (v1.fontSize !== undefined && v2.fontSize !== undefined) {
      this.compareNumeric(changes, 'fontSize', v1.fontSize, v2.fontSize, 'px');
    }

    // Font family
    if (v1.fontFamily !== undefined && v2.fontFamily !== undefined && v1.fontFamily !== v2.fontFamily) {
      changes.push({ property: 'fontFamily', oldValue: v1.fontFamily, newValue: v2.fontFamily, delta: `${v1.fontFamily} → ${v2.fontFamily}` });
    }

    // Font weight
    if (v1.fontWeight !== undefined && v2.fontWeight !== undefined && v1.fontWeight !== v2.fontWeight) {
      changes.push({ property: 'fontWeight', oldValue: v1.fontWeight, newValue: v2.fontWeight, delta: `${v1.fontWeight} → ${v2.fontWeight}` });
    }

    // Font style (italic / normal)
    if (v1.fontStyle !== undefined && v2.fontStyle !== undefined && v1.fontStyle !== v2.fontStyle) {
      changes.push({ property: 'fontStyle', oldValue: v1.fontStyle, newValue: v2.fontStyle, delta: `${v1.fontStyle} → ${v2.fontStyle}` });
    }

    // Micro-typographie (px uniquement — cf. capture plugin)
    if (v1.letterSpacing !== undefined && v2.letterSpacing !== undefined) {
      this.compareNumeric(changes, 'letterSpacing', v1.letterSpacing, v2.letterSpacing, 'px');
    }
    if (v1.lineHeight !== undefined && v2.lineHeight !== undefined) {
      this.compareNumeric(changes, 'lineHeight', v1.lineHeight, v2.lineHeight, 'px');
    }

    // Effects — compare count + per-effect values (not just count)
    const v1Effects = v1.effects ?? [];
    const v2Effects = v2.effects ?? [];
    if (v1Effects.length !== v2Effects.length) {
      changes.push({ property: 'effects', oldValue: `${v1Effects.length} effet(s)`, newValue: `${v2Effects.length} effet(s)`, delta: `${v1Effects.length} → ${v2Effects.length}` });
    } else {
      for (let i = 0; i < v1Effects.length; i++) {
        const e1 = v1Effects[i];
        const e2 = v2Effects[i];
        if (!e1 || !e2) continue;
        const label = v1Effects.length > 1 ? `effect[${i}]` : 'effect';
        if (e1.visible !== e2.visible)
          changes.push({ property: `${label}.visible`, oldValue: e1.visible, newValue: e2.visible, delta: e2.visible ? 'caché → visible' : 'visible → caché' });
        if (Math.abs(e1.radius - e2.radius) > this.EPSILON)
          changes.push({ property: `${label}.radius`, oldValue: e1.radius, newValue: e2.radius, delta: `${e1.radius}px → ${e2.radius}px` });
        if (e1.color && e2.color && !this.colorsEqual(e1.color, e2.color)) {
          const oldHex = this.colorToHex(e1.color);
          const newHex = this.colorToHex(e2.color);
          changes.push({ property: `${label}.color`, oldValue: oldHex, newValue: newHex, delta: `${oldHex} → ${newHex}` });
        }
      }
    }

    return changes;
  }

  private compareNumeric(
    changes: PropertyChange[],
    property: string,
    oldVal: number,
    newVal: number,
    unit: string,
  ): void {
    if (Math.abs(newVal - oldVal) > this.EPSILON) {
      const diff = newVal - oldVal;
      const sign = diff > 0 ? '+' : '';
      changes.push({
        property,
        oldValue: oldVal,
        newValue: newVal,
        delta: `${sign}${diff.toFixed(2)}${unit}`,
      });
    }
  }

  private colorsEqual(a: FigmaColor, b: FigmaColor): boolean {
    return (
      Math.abs(a.r - b.r) < 0.004 &&
      Math.abs(a.g - b.g) < 0.004 &&
      Math.abs(a.b - b.b) < 0.004 &&
      Math.abs(a.a - b.a) < 0.004
    );
  }

  // 4-uplet de rayons [TL,TR,BR,BL] : par-coin si présent, sinon uniforme étalé, sinon null.
  private cornerTuple(n: NodeSnapshot): number[] | null {
    if (n.cornerRadii && n.cornerRadii.length === 4) return n.cornerRadii;
    if (n.cornerRadius !== undefined) return [n.cornerRadius, n.cornerRadius, n.cornerRadius, n.cornerRadius];
    return null;
  }

  private colorToHex(color: FigmaColor): string {
    const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
    const hex = `#${r}${g}${b}`.toUpperCase();
    if (color.a < 1) {
      const a = Math.round(color.a * 255).toString(16).padStart(2, '0');
      return `${hex}${a}`;
    }
    return hex;
  }
}
