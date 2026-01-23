// API request/response types

import { z } from 'zod';
import type { Project, Asset, Version, AnalysisResult } from './database.js';

// ============ Projects ============

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  owner_id: z.string().uuid(),
});

export type CreateProjectRequest = z.infer<typeof createProjectSchema>;

export interface ProjectResponse {
  project: Project;
}

export interface ProjectsListResponse {
  projects: Project[];
}

// ============ Assets ============

export const createAssetSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export type CreateAssetRequest = z.infer<typeof createAssetSchema>;

export interface AssetResponse {
  asset: Asset;
}

export interface AssetsListResponse {
  assets: Asset[];
}

// ============ Versions ============

export const uploadVersionSchema = z.object({
  asset_id: z.string().uuid(),
});

export type UploadVersionRequest = z.infer<typeof uploadVersionSchema>;

export interface VersionResponse {
  version: Version;
  analysis: AnalysisResult | null;
  ai_summary: string | null;
}

export interface VersionsListResponse {
  versions: Version[];
}

export interface CompareVersionsResponse {
  v1: Version;
  v2: Version;
  analysis: AnalysisResult;
  ai_summary: string;
}

// ============ Error Responses ============

export interface ErrorResponse {
  error: string;
  details?: string;
  code?: string;
}

// ============ Common ============

export interface SuccessResponse {
  message: string;
}
