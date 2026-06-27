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
  // Image (hash de référence — octets non stockés, cf. spec image-fills)
  imageHash?: string;
  scaleMode?: string; // 'FILL' | 'FIT' | 'CROP' | 'TILE'
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
  dg_id?: string; // identité stable (cf. spec §5) — optionnel le temps de la migration
  id: string; name: string; type: string;
  x: number; y: number; width: number; height: number; opacity: number;
  visible?: boolean;
  rotation?: number;
  fills: FigmaFill[]; strokes: FigmaStroke[];
  strokeWeight?: number; cornerRadius?: number;
  cornerRadii?: number[]; // [TL, TR, BR, BL] — présent uniquement si coins mixtes
  // Auto-layout : mode de dimensionnement de l'enfant (pour restaurer le resize en auto-layout)
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';
  vectorPaths?: FigmaVectorPath[];
  effects?: FigmaEffect[];
  // TEXT-specific
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: string;
  fontStyleName?: string; // raw Figma fontName.style — exact round-trip for restore
  letterSpacing?: number; // px ; undefined si AUTO/PERCENT/mixed
  lineHeight?: number;    // px ; undefined si AUTO/PERCENT/mixed
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
  | { type: 'SNAPSHOT_READY'; snapshot: FigmaSnapshot; nodeId: string; render_svg_b64?: string; render_kind?: 'svg' | 'png' }
  | { type: 'AUTHOR_INFO'; author: PluginAuthor }
  | { type: 'FILE_INFO'; fileKey: string; fileName: string }
  | { type: 'BRANCH_CREATED'; branchName: string }
  | { type: 'BRANCH_SWITCHED'; branchName: string }
  | { type: 'RESTORE_COMPLETE'; applied: number; skipped: number }
  | { type: 'ERROR'; message: string }
  | { type: 'LINK_TOKEN'; token: string | null };

// Minimal delta shape for canvas restoration (structural subset of DeltaJSON)
export interface RestorationDelta {
  modified: Array<{ nodeId: string; changes: Array<{ property: string }> }>;
  removed:  Array<{ nodeId: string }>;
  added:    Array<{ nodeId: string }>;
}

export type UIToMain =
  | { type: 'REQUEST_SNAPSHOT' }
  | { type: 'RETRY_INIT' }
  | { type: 'OPEN_EXTERNAL'; url: string }
  | { type: 'RESIZE'; width: number; height: number }
  | { type: 'CREATE_BRANCH'; branchName: string }
  | { type: 'SWITCH_BRANCH'; branchName: string }
  | { type: 'STORE_HISTORY_CLONE'; nodeId: string; versionId: string; versionNumber: number }
  | { type: 'RESTORE_TO_FIGMA'; versionId?: string; snapshot: FigmaSnapshot; render_svg_b64?: string; delta?: RestorationDelta }
  | { type: 'LINK_PERSIST_TOKEN'; token: string };
