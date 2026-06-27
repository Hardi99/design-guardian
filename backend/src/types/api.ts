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

// ── Auto-init (plugin — no auth, identified by Figma file key) ────────────────

export const autoInitSchema = z.object({
  figma_file_key: z.string().min(1),
  figma_file_name: z.string().min(1).max(200),
});
export type AutoInitRequest = z.infer<typeof autoInitSchema>;
export interface AutoInitResponse {
  api_key: string;
  project: { id: string; name: string; plan: string };
}

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
export const figmaFillSchema = z.object({
  type: z.string(),
  color: figmaColorSchema.optional(),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
  gradientStops: z.array(z.object({
    position: z.number(),
    color: figmaColorSchema,
  })).optional(),
  gradientAngle: z.number().optional(),
  // Fills IMAGE — hash de référence + mode d'échelle (octets non stockés, cf. spec)
  imageHash: z.string().optional(),
  scaleMode: z.string().optional(),
});
const figmaStrokeSchema = z.object({
  type: z.string(),
  color: figmaColorSchema.optional(),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
});
const figmaVectorPathSchema = z.object({
  windingRule: z.enum(['EVENODD', 'NONZERO']),
  data: z.string(),
});
const figmaEffectSchema = z.object({
  type: z.enum(['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR']),
  visible: z.boolean(),
  radius: z.number(),
  color: figmaColorSchema.optional(),
  offset: z.object({ x: z.number(), y: z.number() }).optional(),
});
const nodeSnapshotSchema: z.ZodType = z.lazy(() =>
  z.object({
    dg_id: z.string().optional(),
    id: z.string(), name: z.string(), type: z.string(),
    x: z.number(), y: z.number(), width: z.number(), height: z.number(),
    opacity: z.number(),
    visible: z.boolean().optional(),
    rotation: z.number().optional(),
    fills: z.array(figmaFillSchema),
    strokes: z.array(figmaStrokeSchema),
    strokeWeight: z.number().optional(),
    cornerRadius: z.number().optional(),
    cornerRadii: z.array(z.number()).length(4).optional(),
    layoutSizingHorizontal: z.enum(['FIXED', 'HUG', 'FILL']).optional(),
    layoutSizingVertical: z.enum(['FIXED', 'HUG', 'FILL']).optional(),
    layoutPositioning: z.enum(['AUTO', 'ABSOLUTE']).optional(),
    effects: z.array(figmaEffectSchema).optional(),
    characters: z.string().optional(),
    fontSize: z.number().optional(),
    fontFamily: z.string().optional(),
    fontWeight: z.number().optional(),
    fontStyle: z.string().optional(),
    fontStyleName: z.string().optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().optional(),
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
  figma_node_id: z.string().optional(),
  render_svg_b64: z.string().optional(),
  render_kind: z.enum(['svg', 'png']).optional(),
  notify_email: z.string().email().optional(),
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

// ── Paiements (abonnement par compte) ─────────────────────────────────────────
export const checkoutSchema = z.object({
  plan: z.enum(['pro', 'team']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});
export type CheckoutRequest = z.infer<typeof checkoutSchema>;

export const portalSchema = z.object({
  return_url: z.string().url(),
});
export type PortalRequest = z.infer<typeof portalSchema>;

// ── Branches / versions (plugin) ──────────────────────────────────────────────
export const statusSchema = z.object({
  status: z.enum(['draft', 'review', 'approved']),
});
export type StatusRequest = z.infer<typeof statusSchema>;

export const restoreSchema = z.object({
  branch_name: z.string().min(1).max(100),
  author: z.object({
    figma_id: z.string(),
    name: z.string(),
    avatar_url: z.string().optional(),
  }),
});
export type RestoreRequest = z.infer<typeof restoreSchema>;

// ── Pont billing↔identité (device-code) ──────────────────────────────────────
export const linkStartSchema = z.object({
  figma_user_id: z.string().min(1).max(64),
  figma_user_name: z.string().max(120).optional(),
});
export const linkApproveSchema = z.object({ code: z.string().min(1).max(64) });
