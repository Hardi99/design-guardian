// Shared types matching backend AnalysisResult

export interface ChangeDetails {
  property?: string;
  old_value?: string | number;
  new_value?: string | number;
  distance?: number;
  percentage?: number;
}

export type ChangeType =
  | 'added'
  | 'removed'
  | 'geometry_modified'
  | 'attribute_changed'
  | 'transform_changed';

export interface Change {
  element_id: string;
  type: ChangeType;
  severity: 'minor' | 'moderate' | 'major';
  details: ChangeDetails;
}

export interface AnalysisMetadata {
  v1_elements_count: number;
  v2_elements_count: number;
  epsilon: number;
  processing_time_ms: number;
}

export interface AnalysisResult {
  total_changes: number;
  changes: Change[];
  metadata: AnalysisMetadata;
}

export interface ComparisonResult {
  svg1: string;
  svg2: string;
  analysis: AnalysisResult;
  aiSummary: string;
}
