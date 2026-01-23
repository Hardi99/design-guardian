// SVG parsing and analysis types

export interface ParsedSVG {
  metadata: SVGMetadata;
  elements: SVGElement[];
  viewBox: ViewBox | null;
}

export interface SVGMetadata {
  width?: string;
  height?: string;
  xmlns?: string;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SVGElement {
  id: string;
  type: SVGElementType;
  attributes: Record<string, string>;
  geometry: Geometry;
}

export type SVGElementType = 'path' | 'rect' | 'circle' | 'ellipse' | 'polygon' | 'polyline' | 'line';

export interface Geometry {
  type: 'path';
  path: string; // Normalized absolute path
  points: Point[];
  bbox: BoundingBox;
  properties: GeometryProperties;
}

export interface Point {
  x: number;
  y: number;
  type?: 'M' | 'L' | 'C' | 'Q' | 'Z'; // Path command type
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeometryProperties {
  area?: number;
  perimeter?: number;
  centroid?: Point;
}

// Normalization context for converting relative to absolute paths
export interface NormalizationContext {
  currentPoint: Point;
  startPoint: Point;
}
