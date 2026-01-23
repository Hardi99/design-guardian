import type { ParsedSVG, SVGElement, Point } from '../types/svg.js';
import type { AnalysisResult, Change } from '../types/database.js';

export class SVGDiffService {
  private readonly EPSILON = 0.01; // Tolerance for geometric comparisons (in pixels)

  /**
   * Compare two parsed SVGs and generate analysis
   */
  async compareSVGs(v1: ParsedSVG, v2: ParsedSVG): Promise<AnalysisResult> {
    const startTime = performance.now();

    const changes: Change[] = [];

    // Create maps for quick lookup
    const v1Map = new Map(v1.elements.map(el => [el.id, el]));
    const v2Map = new Map(v2.elements.map(el => [el.id, el]));

    // Find removed elements
    for (const [id, element] of v1Map) {
      if (!v2Map.has(id)) {
        changes.push({
          element_id: id,
          type: 'removed',
          severity: 'major',
          details: {
            property: 'element',
            old_value: element.type
          }
        });
      }
    }

    // Find added elements
    for (const [id, element] of v2Map) {
      if (!v1Map.has(id)) {
        changes.push({
          element_id: id,
          type: 'added',
          severity: 'major',
          details: {
            property: 'element',
            new_value: element.type
          }
        });
      }
    }

    // Compare existing elements
    for (const [id, v1Element] of v1Map) {
      const v2Element = v2Map.get(id);
      if (!v2Element) continue; // Already handled in removed

      // Compare geometry
      const geometryChanges = this.compareGeometry(id, v1Element, v2Element);
      changes.push(...geometryChanges);

      // Compare attributes
      const attributeChanges = this.compareAttributes(id, v1Element, v2Element);
      changes.push(...attributeChanges);
    }

    const endTime = performance.now();

    return {
      total_changes: changes.length,
      changes,
      metadata: {
        v1_elements_count: v1.elements.length,
        v2_elements_count: v2.elements.length,
        epsilon: this.EPSILON,
        processing_time_ms: Math.round(endTime - startTime)
      }
    };
  }

  /**
   * Compare geometry between two elements
   */
  private compareGeometry(id: string, v1: SVGElement, v2: SVGElement): Change[] {
    const changes: Change[] = [];

    // Compare paths directly
    if (v1.geometry.path !== v2.geometry.path) {
      // Compare point by point
      const pointDiff = this.comparePoints(v1.geometry.points, v2.geometry.points);

      if (pointDiff.distance > this.EPSILON) {
        const severity = this.calculateSeverity(pointDiff.percentage);

        changes.push({
          element_id: id,
          type: 'geometry_modified',
          severity,
          details: {
            property: 'path',
            distance: Math.round(pointDiff.distance * 100) / 100,
            percentage: Math.round(pointDiff.percentage * 100) / 100
          }
        });
      }
    }

    // Compare bounding boxes
    const bboxDiff = this.compareBoundingBoxes(v1.geometry.bbox, v2.geometry.bbox);
    if (bboxDiff > this.EPSILON) {
      changes.push({
        element_id: id,
        type: 'geometry_modified',
        severity: 'moderate',
        details: {
          property: 'bounding_box',
          distance: Math.round(bboxDiff * 100) / 100
        }
      });
    }

    return changes;
  }

  /**
   * Compare points between two geometries
   */
  private comparePoints(
    points1: Point[],
    points2: Point[]
  ): { distance: number; percentage: number } {
    // If different number of points, significant change
    if (points1.length !== points2.length) {
      return {
        distance: Infinity,
        percentage: 100
      };
    }

    if (points1.length === 0) {
      return { distance: 0, percentage: 0 };
    }

    // Calculate average Euclidean distance
    let totalDistance = 0;
    let maxDistance = 0;

    for (let i = 0; i < points1.length; i++) {
      const p1 = points1[i]!;
      const p2 = points2[i]!;
      const dist = this.euclideanDistance(p1, p2);
      totalDistance += dist;
      maxDistance = Math.max(maxDistance, dist);
    }

    const avgDistance = totalDistance / points1.length;

    // Calculate percentage change (arbitrary scale: 10px = 100%)
    const percentage = Math.min(100, (avgDistance / 10) * 100);

    return {
      distance: avgDistance,
      percentage
    };
  }

  /**
   * Calculate Euclidean distance between two points
   */
  private euclideanDistance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Compare bounding boxes
   */
  private compareBoundingBoxes(
    bbox1: { x: number; y: number; width: number; height: number },
    bbox2: { x: number; y: number; width: number; height: number }
  ): number {
    const dx = Math.abs(bbox2.x - bbox1.x);
    const dy = Math.abs(bbox2.y - bbox1.y);
    const dw = Math.abs(bbox2.width - bbox1.width);
    const dh = Math.abs(bbox2.height - bbox1.height);

    return Math.max(dx, dy, dw, dh);
  }

  /**
   * Compare attributes between two elements
   */
  private compareAttributes(id: string, v1: SVGElement, v2: SVGElement): Change[] {
    const changes: Change[] = [];

    const allKeys = new Set([
      ...Object.keys(v1.attributes),
      ...Object.keys(v2.attributes)
    ]);

    for (const key of allKeys) {
      // Skip geometric attributes (already handled)
      if (['d', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height'].includes(key)) {
        continue;
      }

      const oldValue = v1.attributes[key];
      const newValue = v2.attributes[key];

      if (oldValue !== newValue) {
        changes.push({
          element_id: id,
          type: 'attribute_changed',
          severity: this.getAttributeSeverity(key),
          details: {
            property: key,
            old_value: oldValue,
            new_value: newValue
          }
        });
      }
    }

    return changes;
  }

  /**
   * Calculate severity based on percentage change
   */
  private calculateSeverity(percentage: number): 'minor' | 'moderate' | 'major' {
    if (percentage < 2) return 'minor';
    if (percentage < 10) return 'moderate';
    return 'major';
  }

  /**
   * Get severity for attribute changes
   */
  private getAttributeSeverity(attribute: string): 'minor' | 'moderate' | 'major' {
    const visualAttributes = ['fill', 'stroke', 'stroke-width', 'opacity'];
    if (visualAttributes.includes(attribute)) {
      return 'moderate';
    }
    return 'minor';
  }
}
