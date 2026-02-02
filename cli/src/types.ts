export interface ParsedSVG {
  metadata: { width?: string; height?: string };
  elements: SVGElement[];
}

export interface SVGElement {
  id: string;
  type: string;
  attributes: Record<string, string>;
  geometry: {
    path: string;
    points: Point[];
    bbox: BoundingBox;
  };
}

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Change {
  element_id: string;
  type: 'added' | 'removed' | 'geometry_modified' | 'attribute_changed';
  severity: 'minor' | 'moderate' | 'major';
  details: Record<string, unknown>;
}

export interface DiffResult {
  total_changes: number;
  changes: Change[];
  summary: string;
}
