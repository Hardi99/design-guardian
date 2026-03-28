// Types mirroring Figma plugin API output
// These match what node.fills, node.absoluteTransform, etc. return in main.ts

export interface FigmaColor {
  r: number; // 0-1
  g: number; // 0-1
  b: number; // 0-1
  a: number; // 0-1
}

export interface FigmaGradientStop {
  position: number; // 0-1
  color: FigmaColor;
}

export interface FigmaFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE' | 'PATTERN';
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
  gradientStops?: FigmaGradientStop[];
  gradientAngle?: number; // simplified 0-360°
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

export interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible: boolean;
  radius: number;
  color?: FigmaColor;
  offset?: { x: number; y: number };
}

// Snapshot of a single Figma node, extracted in main.ts via native Figma API
export interface NodeSnapshot {
  id: string;
  name: string;
  type: string;
  // Absolute position
  x: number;
  y: number;
  width: number;
  height: number;
  // Visual properties
  opacity: number;
  visible?: boolean;
  rotation?: number;
  fills: FigmaFill[];
  strokes: FigmaStroke[];
  strokeWeight?: number;
  cornerRadius?: number;
  effects?: FigmaEffect[];
  // TEXT-specific
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  // For VECTOR nodes
  vectorPaths?: FigmaVectorPath[];
  // Recursive children
  children?: NodeSnapshot[];
}

// The full snapshot payload sent from the Figma plugin
export interface FigmaSnapshot {
  figmaNodeId: string;
  figmaNodeName: string;
  capturedAt: string;
  root: NodeSnapshot;
}

// A single property change between two snapshots
export interface PropertyChange {
  property: string;
  oldValue: unknown;
  newValue: unknown;
  delta?: string;
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
