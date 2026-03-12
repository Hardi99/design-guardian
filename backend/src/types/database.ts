import type { DeltaJSON, FigmaSnapshot } from './figma.js';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  figma_id: string | null;
  plan: 'free' | 'pro' | 'team';
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  api_key: string;
  plan: 'free' | 'pro' | 'team';
  created_at: string;
}

export interface Asset {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  asset_type: 'logo' | 'icon' | 'packaging' | 'illustration' | 'ui' | 'other';
  created_at: string;
}

export interface Version {
  id: string;
  asset_id: string;
  parent_id: string | null;
  branch_name: string;
  version_number: number;
  author_id: string | null;         // nullable — use author_* fields below
  author_figma_id: string | null;   // from figma.currentUser.id
  author_name: string | null;       // from figma.currentUser.name
  author_avatar_url: string | null; // from figma.currentUser.photoUrl
  figma_node_id: string | null;
  snapshot_json: FigmaSnapshot;
  storage_path: string | null;
  analysis_json: DeltaJSON | null;
  ai_summary: string | null;
  status: 'draft' | 'review' | 'approved';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}
