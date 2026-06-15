import type { DeltaJSON, FigmaSnapshot } from './figma.js';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  figma_id: string | null;
  plan: 'free' | 'pro' | 'team';
  // L'abonnement est porté par le compte (profile), pas par le projet — cf. payments.service.ts
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  api_key: string;
  plan: 'free' | 'pro' | 'team';
  figma_file_key: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Asset {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  asset_type: 'logo' | 'icon' | 'packaging' | 'illustration' | 'ui' | 'other';
  created_at: string;
  updated_at: string | null;
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
  snapshot_json: FigmaSnapshot | null; // null pour les versions post-migration 008
  storage_path: string | null;         // path dans le bucket 'snapshots'
  analysis_json: DeltaJSON | null;
  ai_summary: string | null;
  // Source de vérité de l'approbation = `status` (+ approved_at/by).
  // Colonnes SQL legacy `is_approved` et `file_size` supprimées (migration security_perf_hardening).
  status: 'draft' | 'review' | 'approved';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}
