import type { ParsedSVG, SVGElement, Point, Change, DiffResult } from './types.js';

const EPSILON = 0.01;

export function compareSVGs(v1: ParsedSVG, v2: ParsedSVG): DiffResult {
  const changes: Change[] = [];
  const v1Map = new Map(v1.elements.map(el => [el.id, el]));
  const v2Map = new Map(v2.elements.map(el => [el.id, el]));

  // Removed
  for (const [id, el] of v1Map) {
    if (!v2Map.has(id)) {
      changes.push({
        element_id: id,
        type: 'removed',
        severity: 'major',
        details: { element_type: el.type },
      });
    }
  }

  // Added
  for (const [id, el] of v2Map) {
    if (!v1Map.has(id)) {
      changes.push({
        element_id: id,
        type: 'added',
        severity: 'major',
        details: { element_type: el.type },
      });
    }
  }

  // Modified
  for (const [id, v1El] of v1Map) {
    const v2El = v2Map.get(id);
    if (!v2El) continue;

    // Geometry
    if (v1El.geometry.path !== v2El.geometry.path) {
      const dist = comparePoints(v1El.geometry.points, v2El.geometry.points);
      if (dist > EPSILON) {
        changes.push({
          element_id: id,
          type: 'geometry_modified',
          severity: dist > 5 ? 'major' : dist > 1 ? 'moderate' : 'minor',
          details: { distance: Math.round(dist * 100) / 100 },
        });
      }
    }

    // Attributes
    const allKeys = new Set([...Object.keys(v1El.attributes), ...Object.keys(v2El.attributes)]);
    for (const key of allKeys) {
      if (['d', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height'].includes(key)) continue;
      if (v1El.attributes[key] !== v2El.attributes[key]) {
        changes.push({
          element_id: id,
          type: 'attribute_changed',
          severity: ['fill', 'stroke', 'opacity'].includes(key) ? 'moderate' : 'minor',
          details: { property: key, old: v1El.attributes[key], new: v2El.attributes[key] },
        });
      }
    }
  }

  return {
    total_changes: changes.length,
    changes,
    summary: generateSummary(changes),
  };
}

function comparePoints(p1: Point[], p2: Point[]): number {
  if (p1.length === 0 || p2.length === 0) return 10; // Default significant change

  // Use the smaller array length for comparison
  const len = Math.min(p1.length, p2.length);
  let total = 0;

  for (let i = 0; i < len; i++) {
    const i1 = Math.floor((i / len) * p1.length);
    const i2 = Math.floor((i / len) * p2.length);
    const dx = p2[i2]!.x - p1[i1]!.x;
    const dy = p2[i2]!.y - p1[i1]!.y;
    total += Math.sqrt(dx * dx + dy * dy);
  }

  return total / len;
}

function generateSummary(changes: Change[]): string {
  if (changes.length === 0) return 'Aucune modification détectée.';

  const added = changes.filter(c => c.type === 'added').length;
  const removed = changes.filter(c => c.type === 'removed').length;
  const geometry = changes.filter(c => c.type === 'geometry_modified').length;
  const attrs = changes.filter(c => c.type === 'attribute_changed').length;

  const parts: string[] = [];
  if (added) parts.push(`${added} ajouté(s)`);
  if (removed) parts.push(`${removed} supprimé(s)`);
  if (geometry) parts.push(`${geometry} modif. géométrique(s)`);
  if (attrs) parts.push(`${attrs} attribut(s) changé(s)`);

  return `${changes.length} changement(s): ${parts.join(', ')}`;
}
