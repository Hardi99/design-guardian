import type {
  FigmaSnapshot,
  NodeSnapshot,
  FigmaColor,
  NodeDelta,
  PropertyChange,
  DeltaJSON,
} from '../types/figma.js';

export class DiffService {
  private readonly EPSILON = 0.01; // px tolerance for geometric comparisons

  compareSnapshots(v1: FigmaSnapshot, v2: FigmaSnapshot): DeltaJSON {
    const startTime = performance.now();

    const v1Map = this.flattenTree(v1.root);
    const v2Map = this.flattenTree(v2.root);

    const modified: NodeDelta[] = [];
    const added: NodeDelta[] = [];
    const removed: NodeDelta[] = [];

    // Removed: in v1 but not in v2
    for (const [id, node] of v1Map) {
      if (!v2Map.has(id)) {
        removed.push({ nodeId: id, nodeName: node.name, nodeType: node.type, changes: [] });
      }
    }

    // Added: in v2 but not in v1
    for (const [id, node] of v2Map) {
      if (!v1Map.has(id)) {
        added.push({ nodeId: id, nodeName: node.name, nodeType: node.type, changes: [] });
      }
    }

    // Modified: in both, compare properties
    for (const [id, v1Node] of v1Map) {
      const v2Node = v2Map.get(id);
      if (!v2Node) continue;

      const changes = this.compareNodes(v1Node, v2Node);
      if (changes.length > 0) {
        modified.push({ nodeId: id, nodeName: v2Node.name, nodeType: v2Node.type, changes });
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

  // Flatten a node tree into a flat map: id -> NodeSnapshot
  private flattenTree(root: NodeSnapshot): Map<string, NodeSnapshot> {
    const map = new Map<string, NodeSnapshot>();
    const traverse = (node: NodeSnapshot) => {
      map.set(node.id, node);
      if (node.children) {
        for (const child of node.children) traverse(child);
      }
    };
    traverse(root);
    return map;
  }

  private compareNodes(v1: NodeSnapshot, v2: NodeSnapshot): PropertyChange[] {
    const changes: PropertyChange[] = [];

    // Position
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

    // Corner radius
    if (v1.cornerRadius !== undefined && v2.cornerRadius !== undefined) {
      this.compareNumeric(changes, 'cornerRadius', v1.cornerRadius, v2.cornerRadius, 'px');
    }

    // Stroke weight
    if (v1.strokeWeight !== undefined && v2.strokeWeight !== undefined) {
      this.compareNumeric(changes, 'strokeWeight', v1.strokeWeight, v2.strokeWeight, 'px');
    }

    // Fills (compare first solid fill color)
    const v1Fill = v1.fills.find(f => f.type === 'SOLID' && f.color);
    const v2Fill = v2.fills.find(f => f.type === 'SOLID' && f.color);
    if (v1Fill?.color && v2Fill?.color && !this.colorsEqual(v1Fill.color, v2Fill.color)) {
      const oldHex = this.colorToHex(v1Fill.color);
      const newHex = this.colorToHex(v2Fill.color);
      changes.push({ property: 'fill', oldValue: oldHex, newValue: newHex, delta: `${oldHex} -> ${newHex}` });
    }

    // Fill visibility change
    if (v1.fills.length !== v2.fills.length) {
      changes.push({
        property: 'fills',
        oldValue: `${v1.fills.length} fill(s)`,
        newValue: `${v2.fills.length} fill(s)`,
      });
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

    // Effects (count change as proxy)
    const v1FxCount = (v1.effects ?? []).filter(e => e.visible).length;
    const v2FxCount = (v2.effects ?? []).filter(e => e.visible).length;
    if (v1FxCount !== v2FxCount) {
      changes.push({
        property: 'effects',
        oldValue: `${v1FxCount} effet(s)`,
        newValue: `${v2FxCount} effet(s)`,
      });
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
