import type { AnalysisResult } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

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
  status: 'draft' | 'approved' | 'rejected';
  approved_at: string | null;
  created_at: string;
}

interface CompareResponse {
  v1: Version;
  v2: Version;
  svg1: string;
  svg2: string;
  analysis: AnalysisResult;
  ai_summary: string;
}

class APIClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  // Projects
  async getProjects(ownerId: string): Promise<Project[]> {
    const res = await fetch(`${this.baseURL}/api/projects?owner_id=${ownerId}`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    const data = await res.json();
    return data.projects;
  }

  async getProject(id: string): Promise<Project> {
    const res = await fetch(`${this.baseURL}/api/projects/${id}`);
    if (!res.ok) throw new Error('Failed to fetch project');
    const data = await res.json();
    return data.project;
  }

  async createProject(name: string, ownerId: string): Promise<Project> {
    const res = await fetch(`${this.baseURL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, owner_id: ownerId }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    const data = await res.json();
    return data.project;
  }

  async deleteProject(id: string): Promise<void> {
    const res = await fetch(`${this.baseURL}/api/projects/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete project');
  }

  // Assets
  async getAssets(projectId: string, branch?: string): Promise<Asset[]> {
    const params = new URLSearchParams({ project_id: projectId });
    if (branch) params.append('branch', branch);
    const res = await fetch(`${this.baseURL}/api/assets?${params}`);
    if (!res.ok) throw new Error('Failed to fetch assets');
    const data = await res.json();
    return data.assets;
  }

  async getBranches(projectId: string): Promise<string[]> {
    const res = await fetch(`${this.baseURL}/api/assets/branches?project_id=${projectId}`);
    if (!res.ok) throw new Error('Failed to fetch branches');
    const data = await res.json();
    return data.branches;
  }

  async getAsset(id: string): Promise<Asset> {
    const res = await fetch(`${this.baseURL}/api/assets/${id}`);
    if (!res.ok) throw new Error('Failed to fetch asset');
    const data = await res.json();
    return data.asset;
  }

  async createAsset(projectId: string, name: string, branch = 'main'): Promise<Asset> {
    const res = await fetch(`${this.baseURL}/api/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, name, branch }),
    });
    if (!res.ok) throw new Error('Failed to create asset');
    const data = await res.json();
    return data.asset;
  }

  // Versions
  async getVersions(assetId: string): Promise<Version[]> {
    const res = await fetch(`${this.baseURL}/api/versions?asset_id=${assetId}`);
    if (!res.ok) throw new Error('Failed to fetch versions');
    const data = await res.json();
    return data.versions;
  }

  async uploadVersion(assetId: string, file: File): Promise<Version> {
    const formData = new FormData();
    formData.append('asset_id', assetId);
    formData.append('file', file);

    const res = await fetch(`${this.baseURL}/api/versions/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload version');
    const data = await res.json();
    return data.version;
  }

  async compareVersions(v1Id: string, v2Id: string): Promise<CompareResponse> {
    const res = await fetch(`${this.baseURL}/api/versions/compare/${v1Id}/${v2Id}`);
    if (!res.ok) throw new Error('Failed to compare versions');
    return await res.json();
  }

  async updateVersionStatus(versionId: string, status: 'draft' | 'approved' | 'rejected'): Promise<Version> {
    const res = await fetch(`${this.baseURL}/api/versions/${versionId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update version status');
    const data = await res.json();
    return data.version;
  }
}

export const apiClient = new APIClient(API_URL);
