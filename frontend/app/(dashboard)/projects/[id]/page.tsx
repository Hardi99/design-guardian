'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { apiClient, type Project, type Asset, type Version } from '@/lib/api/client';
import { DiffVisualizer } from '@/components/DiffVisualizer';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Upload,
  FileImage,
  Loader2,
  Layers,
  Trash2,
} from 'lucide-react';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create asset
  const [newAssetName, setNewAssetName] = useState('');
  const [creatingAsset, setCreatingAsset] = useState(false);

  // Upload
  const [uploadingAssetId, setUploadingAssetId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Versions & comparison
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [comparison, setComparison] = useState<{
    svg1: string;
    svg2: string;
    analysis: any;
    aiSummary: string;
  } | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    try {
      const [proj, assetsList] = await Promise.all([
        apiClient.getProject(id),
        apiClient.getAssets(id),
      ]);
      setProject(proj);
      setAssets(assetsList);
    } catch (err: any) {
      setError(err.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetName.trim()) return;
    setCreatingAsset(true);
    try {
      await apiClient.createAsset(id, newAssetName.trim());
      setNewAssetName('');
      loadProject();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingAsset(false);
    }
  };

  const handleUploadClick = (assetId: string) => {
    setUploadingAssetId(assetId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingAssetId) return;

    setUploading(true);
    setError('');
    try {
      await apiClient.uploadVersion(uploadingAssetId, file);
      loadProject();
      // If we're viewing this asset's versions, reload them
      if (selectedAsset?.id === uploadingAssetId) {
        loadVersions(uploadingAssetId);
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'upload');
    } finally {
      setUploading(false);
      setUploadingAssetId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const loadVersions = async (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    setSelectedAsset(asset);
    setComparison(null);
    try {
      const vers = await apiClient.getVersions(assetId);
      setVersions(vers);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCompare = async (v1: Version, v2: Version) => {
    setComparing(true);
    try {
      const result = await apiClient.compareVersions(v1.id, v2.id);
      setComparison({
        svg1: result.svg1,
        svg2: result.svg2,
        analysis: result.analysis,
        aiSummary: result.ai_summary || '',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setComparing(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Chargement du projet...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 text-center">
        <p className="text-muted-foreground">Projet introuvable.</p>
        <Link href="/dashboard" className="text-primary hover:underline mt-4 inline-block">
          Retour au dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au dashboard
        </Link>
        <h1 className="font-display text-3xl font-bold mb-1">{project.name}</h1>
        <p className="text-sm text-muted-foreground">
          Créé le {new Date(project.created_at).toLocaleDateString('fr-FR')}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400">
          {error}
          <button onClick={() => setError('')} className="ml-4 underline text-sm">
            Fermer
          </button>
        </div>
      )}

      {/* Upload loading indicator */}
      {uploading && (
        <div className="mb-6 p-4 rounded-lg border border-primary/50 bg-primary/10 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Upload et analyse en cours...</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Assets */}
        <div className="lg:col-span-1">
          {/* Create Asset */}
          <div className="mb-6 rounded-xl border border-border bg-card/50 p-4">
            <h2 className="font-semibold mb-3">Nouvel Asset</h2>
            <form onSubmit={handleCreateAsset} className="flex gap-2">
              <input
                type="text"
                value={newAssetName}
                onChange={(e) => setNewAssetName(e.target.value)}
                placeholder="ex: logo-principal"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="submit"
                disabled={creatingAsset || !newAssetName.trim()}
                className="btn-shine rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {creatingAsset ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
            </form>
          </div>

          {/* Assets List */}
          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Assets ({assets.length})
            </h2>
            {assets.length === 0 ? (
              <div className="text-center py-8 rounded-xl border border-dashed border-border">
                <FileImage className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Aucun asset</p>
              </div>
            ) : (
              assets.map((asset) => (
                <div
                  key={asset.id}
                  className={`rounded-xl border p-4 transition-all cursor-pointer ${
                    selectedAsset?.id === asset.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card/50 hover:border-primary/30'
                  }`}
                  onClick={() => loadVersions(asset.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileImage className="h-5 w-5 text-primary" />
                      <span className="font-medium text-sm">{asset.name}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUploadClick(asset.id);
                      }}
                      className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      title="Uploader une version"
                    >
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Versions & Comparison */}
        <div className="lg:col-span-2">
          {selectedAsset ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-semibold">
                  {selectedAsset.name}
                </h2>
                <button
                  onClick={() => handleUploadClick(selectedAsset.id)}
                  className="btn-shine inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  <Upload className="h-4 w-4" />
                  Nouvelle version
                </button>
              </div>

              {/* Versions list */}
              {versions.length === 0 ? (
                <div className="text-center py-16 rounded-xl border border-dashed border-border">
                  <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Aucune version uploadée
                  </p>
                  <button
                    onClick={() => handleUploadClick(selectedAsset.id)}
                    className="btn-shine inline-flex items-center gap-2 rounded-lg px-6 py-3 font-medium text-primary-foreground"
                  >
                    <Upload className="h-4 w-4" />
                    Uploader un SVG
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Version cards */}
                  <div className="grid gap-3">
                    {versions.map((version, index) => (
                      <div
                        key={version.id}
                        className="rounded-xl border border-border bg-card/50 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium">
                              Version {version.version_number}
                            </span>
                            <span className="text-sm text-muted-foreground ml-3">
                              {new Date(version.created_at).toLocaleString('fr-FR')}
                            </span>
                          </div>
                          {index < versions.length - 1 && (
                            <button
                              onClick={() => handleCompare(versions[index + 1], version)}
                              disabled={comparing}
                              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
                            >
                              {comparing ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Layers className="h-3 w-3" />
                              )}
                              Comparer avec v{versions[index + 1].version_number}
                            </button>
                          )}
                        </div>
                        {version.ai_summary && (
                          <p className="mt-2 text-sm text-muted-foreground border-t border-border pt-2">
                            {version.ai_summary}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Comparison result */}
                  {comparison && (
                    <div className="mt-8">
                      <h3 className="font-display text-lg font-semibold mb-4">
                        Résultat de la comparaison
                      </h3>
                      <DiffVisualizer
                        svg1={comparison.svg1}
                        svg2={comparison.svg2}
                        analysis={comparison.analysis}
                        aiSummary={comparison.aiSummary}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-24 rounded-xl border border-dashed border-border">
              <FileImage className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg text-muted-foreground">
                Sélectionnez un asset pour voir ses versions
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Ou créez-en un nouveau pour commencer
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
