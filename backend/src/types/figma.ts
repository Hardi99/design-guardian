// Types mirroring Figma plugin API output
// These match what node.fills, node.absoluteTransform, etc. return in main.ts

export interface FigmaColor {
  r: number; // 0-1
  g: number; // 0-1
  b: number; // 0-1
  a: number; // 0-1
}

export interface FigmaFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE' | 'PATTERN';
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
}

export interface FigmaStroke {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL';
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
}

export interface FigmaVectorPath {
  windingRule: 'EVENODD' | 'NONZERO';
  data: string; // SVG path data string
}

// Snapshot of a single Figma node, extracted in main.ts via native Figma API
export interface NodeSnapshot {
  id: string;
  name: string;
  type: string; // 'RECTANGLE', 'ELLIPSE', 'VECTOR', 'FRAME', 'GROUP', 'TEXT', etc.
  // Absolute position — already resolved by Figma (no transform matrix needed)
  x: number;
  y: number;
  width: number;
  height: number;
  // Visual properties
  opacity: number;
  fills: FigmaFill[];
  strokes: FigmaStroke[];
  strokeWeight?: number;
  cornerRadius?: number;
  // For VECTOR nodes
  vectorPaths?: FigmaVectorPath[];
  // Recursive children
  children?: NodeSnapshot[];
}

// The full snapshot payload sent from the Figma plugin
export interface FigmaSnapshot {
  figmaNodeId: string;    // node.id in Figma
  figmaNodeName: string;  // node.name in Figma
  capturedAt: string;     // ISO timestamp
  root: NodeSnapshot;
}

// A single property change between two snapshots
export interface PropertyChange {
  property: string;
  oldValue: unknown;
  newValue: unknown;
  delta?: string; // Human-readable: "+2.5px", "#CCCCCC -> #555555", "0 -> 8px"
}

// Changes for a single node
export interface NodeDelta {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  changes: PropertyChange[];
}

// The complete diff output — stored in analysis_json and sent to OpenAI
export interface DeltaJSON {
  modified: NodeDelta[];
  added: NodeDelta[];
  removed: NodeDelta[];
  totalChanges: number;
  metadata: {
    v1CapturedAt: string;
    v2CapturedAt: string;
    epsilon: number;
    processingTimeMs: number;
  };
}
