// ─── Figma native property types ─────────────────────────────────────────────

export interface FigmaColor { r: number; g: number; b: number; a: number }

export interface FigmaGradientStop { position: number; color: FigmaColor }

export interface FigmaFill {
  type: string;
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
  // Gradient
  gradientStops?: FigmaGradientStop[];
  gradientAngle?: number; // simplified: 0-360°
}

export interface FigmaStroke { type: string; color?: FigmaColor; opacity?: number }
export interface FigmaVectorPath { windingRule: 'EVENODD' | 'NONZERO'; data: string }

export interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible: boolean;
  radius: number;
  color?: FigmaColor;
  offset?: { x: number; y: number };
}

export interface NodeSnapshot {
  id: string; name: string; type: string;
  x: number; y: number; width: number; height: number; opacity: number;
  visible?: boolean;
  rotation?: number;
  fills: FigmaFill[]; strokes: FigmaStroke[];
  strokeWeight?: number; cornerRadius?: number;
  vectorPaths?: FigmaVectorPath[];
  effects?: FigmaEffect[];
  // TEXT-specific
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  children?: NodeSnapshot[];
}

export interface FigmaSnapshot {
  figmaNodeId: string; figmaNodeName: string; capturedAt: string; root: NodeSnapshot;
}

// ─── Plugin author (from figma.currentUser) ───────────────────────────────────

export interface PluginAuthor {
  figma_id: string;
  name: string;
  avatar_url?: string;
}

// ─── Messages main.ts ↔ ui.tsx ───────────────────────────────────────────────

export type MainToUI =
  | { type: 'SNAPSHOT_READY'; snapshot: FigmaSnapshot; nodeId: string }
  | { type: 'AUTHOR_INFO'; author: PluginAuthor }
  | { type: 'FILE_INFO'; fileKey: string; fileName: string }
  | { type: 'ERROR'; message: string };

export type UIToMain =
  | { type: 'REQUEST_SNAPSHOT' }
  | { type: 'OPEN_EXTERNAL'; url: string }
  | { type: 'RESIZE'; width: number; height: number };
