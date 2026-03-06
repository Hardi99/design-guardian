'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient, type Project, type Asset, type Version } from '@/lib/api/client';
import type { AnalysisResult, ComparisonResult } from '@/lib/types';

export function useProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [branches, setBranches] = useState<string[]>(['main']);
  const [currentBranch, setCurrentBranch] = useState('main');
  const currentBranchRef = useRef('main');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);

  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [comparing, setComparing] = useState(false);

  const loadProject = useCallback(async (branch?: string) => {
    const branchToUse = branch ?? currentBranchRef.current;
    try {
      const [proj, assetsList, branchList] = await Promise.all([
        apiClient.getProject(projectId),
        apiClient.getAssets(projectId, branchToUse).catch(() => []),
        apiClient.getBranches(projectId),
      ]);
      setProject(proj);
      setAssets(assetsList);
      setBranches(branchList);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const switchBranch = useCallback((branch: string) => {
    currentBranchRef.current = branch;
    setCurrentBranch(branch);
    setSelectedAsset(null);
    setVersions([]);
    setComparison(null);
    loadProject(branch);
  }, [loadProject]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const loadVersions = useCallback(async (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    setSelectedAsset(asset);
    setComparison(null);
    try {
      const vers = await apiClient.getVersions(assetId);
      setVersions(vers);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement des versions');
    }
  }, [assets]);

  const handleCompare = useCallback(async (v1: Version, v2: Version) => {
    setComparing(true);
    try {
      const result = await apiClient.compareVersions(v1.id, v2.id);
      setComparison({
        svg1: result.svg1,
        svg2: result.svg2,
        analysis: result.analysis as AnalysisResult,
        aiSummary: result.ai_summary || '',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de comparaison');
    } finally {
      setComparing(false);
    }
  }, []);

  const handleStatusChange = useCallback(async (versionId: string, status: 'approved' | 'rejected' | 'draft') => {
    try {
      await apiClient.updateVersionStatus(versionId, status);
      if (selectedAsset) {
        loadVersions(selectedAsset.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de mise à jour du statut');
    }
  }, [selectedAsset, loadVersions]);

  const clearError = useCallback(() => setError(''), []);

  return {
    project,
    assets,
    branches,
    currentBranch,
    switchBranch,
    loading,
    error,
    clearError,
    selectedAsset,
    versions,
    comparison,
    comparing,
    loadProject,
    loadVersions,
    handleCompare,
    handleStatusChange,
    setError,
  };
}
