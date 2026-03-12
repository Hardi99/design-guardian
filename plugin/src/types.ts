// ─── Figma native property types ─────────────────────────────────────────────

export interface FigmaColor { r: number; g: number; b: number; a: number }
export interface FigmaFill   { type: string; color?: FigmaColor; opacity?: number; visible?: boolean }
export interface FigmaStroke { type: string; color?: FigmaColor; opacity?: number }
export interface FigmaVectorPath { windingRule: 'EVENODD' | 'NONZERO'; data: string }

export interface NodeSnapshot {
  id: string; name: string; type: string;
  x: number; y: number; width: number; height: number; opacity: number;
  fills: FigmaFill[]; strokes: FigmaStroke[];
  strokeWeight?: number; cornerRadius?: number;
  vectorPaths?: FigmaVectorPath[];
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
  | { type: 'SNAPSHOT_READY'; snapshot: FigmaSnapshot; svgBase64: string; nodeId: string }
  | { type: 'AUTHOR_INFO'; author: PluginAuthor }
  | { type: 'KEY_LOADED'; key: string | null }
  | { type: 'ERROR'; message: string };

export type UIToMain =
  | { type: 'REQUEST_SNAPSHOT' }
  | { type: 'SAVE_KEY'; key: string }
  | { type: 'LOAD_KEY' }
  | { type: 'OPEN_EXTERNAL'; url: string }
  | { type: 'RESIZE'; width: number; height: number };
