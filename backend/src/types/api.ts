import { z } from 'zod';
import type { Project, Asset, Version } from './database.js';
import type { DeltaJSON } from './figma.js';

// ── Projects (web app) ────────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});
export type CreateProjectRequest = z.infer<typeof createProjectSchema>;
export interface ProjectResponse       { project: Project }
export interface ProjectsListResponse  { projects: Project[] }

// ── Assets (plugin) ───────────────────────────────────────────────────────────

export const createAssetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  asset_type: z.enum(['logo', 'icon', 'packaging', 'illustration', 'ui', 'other']).default('other'),
});
export type CreateAssetRequest = z.infer<typeof createAssetSchema>;
export interface AssetResponse      { asset: Asset }
export interface AssetsListResponse { assets: Asset[] }

// ── Checkpoints (plugin) ──────────────────────────────────────────────────────

const figmaColorSchema = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1),
});
const figmaFillSchema = z.object({
  type: z.string(),
  color: figmaColorSchema.optional(),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
});
const figmaStrokeSchema = figmaFillSchema; // same shape
const figmaVectorPathSchema = z.object({
  windingRule: z.enum(['EVENODD', 'NONZERO']),
  data: z.string(),
});
const nodeSnapshotSchema: z.ZodType = z.lazy(() =>
  z.object({
    id: z.string(), name: z.string(), type: z.string(),
    x: z.number(), y: z.number(), width: z.number(), height: z.number(),
    opacity: z.number(),
    fills: z.array(figmaFillSchema),
    strokes: z.array(figmaStrokeSchema),
    strokeWeight: z.number().optional(),
    cornerRadius: z.number().optional(),
    vectorPaths: z.array(figmaVectorPathSchema).optional(),
    children: z.array(nodeSnapshotSchema).optional(),
  })
);
const figmaSnapshotSchema = z.object({
  figmaNodeId: z.string(), figmaNodeName: z.string(),
  capturedAt: z.string(), root: nodeSnapshotSchema,
});

export const createCheckpointSchema = z.object({
  asset_id: z.string().uuid(),
  branch_name: z.string().min(1).max(100).default('main'),
  snapshot_json: figmaSnapshotSchema,
  svg_base64: z.string().optional(),
  figma_node_id: z.string().optional(),
  author: z.object({
    figma_id: z.string(),
    name: z.string(),
    avatar_url: z.string().optional(),
  }),
});
export type CreateCheckpointRequest = z.infer<typeof createCheckpointSchema>;
export interface CheckpointResponse {
  version: Version;
  analysis: DeltaJSON | null;
  ai_summary: string | null;
}

// ── Version tree (plugin) ─────────────────────────────────────────────────────

export interface VersionTreeResponse {
  versions: Version[];
  branches: string[];
}

// ── Approve ───────────────────────────────────────────────────────────────────

export interface ApproveVersionResponse { version: Version }

// ── Generic ───────────────────────────────────────────────────────────────────

export interface ErrorResponse   { error: string; details?: string }
export interface SuccessResponse { message: string }
