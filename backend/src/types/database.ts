// Database types matching Supabase schema

export interface Profile {
  id: string;
  email: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface Asset {
  id: string;
  project_id: string;
  name: string;
  branch: string;
  current_version_id: string | null;
  created_at: string;
}

export interface Version {
  id: string;
  asset_id: string;
  storage_path: string;
  version_number: number;
  analysis_json: AnalysisResult | null;
  ai_summary: string | null;
  created_at: string;
}

export interface AnalysisResult {
  total_changes: number;
  changes: Change[];
  metadata: AnalysisMetadata;
}

export interface Change {
  element_id: string;
  type: ChangeType;
  severity: 'minor' | 'moderate' | 'major';
  details: ChangeDetails;
}

export type ChangeType =
  | 'added'
  | 'removed'
  | 'geometry_modified'
  | 'attribute_changed'
  | 'transform_changed';

export interface ChangeDetails {
  property?: string;
  old_value?: string | number;
  new_value?: string | number;
  distance?: number; // For geometry changes (in pixels)
  percentage?: number; // Percentage of change
}

export interface AnalysisMetadata {
  v1_elements_count: number;
  v2_elements_count: number;
  epsilon: number; // Tolerance used for comparison
  processing_time_ms: number;
}
