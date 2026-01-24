'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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
  CloudUpload,
  CheckCircle,
  XCircle,
  Clock,
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

  // Upload & Drag and Drop
  const [uploadingAssetId, setUploadingAssetId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

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

  const uploadFile = useCallback(async (file: File, assetId: string) => {
    if (!file.name.endsWith('.svg') && file.type !== 'image/svg+xml') {
      setError('Seuls les fichiers SVG sont acceptés');
      return;
    }
    setUploading(true);
    setError('');
    try {
      await apiClient.uploadVersion(assetId, file);
      loadProject();
      if (selectedAsset?.id === assetId) {
        loadVersions(assetId);
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'upload');
    } finally {
      setUploading(false);
      setUploadingAssetId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [selectedAsset]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingAssetId) return;
    uploadFile(file, uploadingAssetId);
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (selectedAsset) {
      uploadFile(file, selectedAsset.id);
    } else {
      setError('Sélectionnez un asset avant de déposer un fichier');
    }
  }, [selectedAsset, uploadFile]);

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

  const handleStatusChange = async (versionId: string, status: 'approved' | 'rejected' | 'draft') => {
    try {
      await apiClient.updateVersionStatus(versionId, status);
      if (selectedAsset) {
        loadVersions(selectedAsset.id);
      }
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
        <div
          className="lg:col-span-2"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="rounded-2xl border-2 border-dashed border-primary bg-primary/10 p-16 text-center">
                <CloudUpload className="h-16 w-16 text-primary mx-auto mb-4 animate-bounce" />
                <p className="text-xl font-semibold text-primary">
                  Déposez votre fichier SVG
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedAsset ? `Upload vers ${selectedAsset.name}` : 'Sélectionnez un asset d\'abord'}
                </p>
              </div>
            </div>
          )}

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
                <div
                  className="text-center py-16 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => handleUploadClick(selectedAsset.id)}
                >
                  <CloudUpload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-2">
                    Glissez-déposez un SVG ici
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ou cliquez pour parcourir
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Version cards */}
                  <div className="grid gap-3">
                    {versions.map((version, index) => (
                      <div
                        key={version.id}
                        className={`rounded-xl border p-4 ${
                          version.status === 'approved'
                            ? 'border-green-500/30 bg-green-500/5'
                            : version.status === 'rejected'
                            ? 'border-red-500/30 bg-red-500/5'
                            : 'border-border bg-card/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">
                              v{version.version_number}
                            </span>
                            {/* Status badge */}
                            {version.status === 'approved' && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                                <CheckCircle className="h-3 w-3" />
                                Gold
                              </span>
                            )}
                            {version.status === 'rejected' && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                                <XCircle className="h-3 w-3" />
                                Rejeté
                              </span>
                            )}
                            {version.status === 'draft' && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                                <Clock className="h-3 w-3" />
                                Draft
                              </span>
                            )}
                            <span className="text-sm text-muted-foreground">
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
                              Diff v{versions[index + 1].version_number}
                            </button>
                          )}
                        </div>

                        {/* Approve/Reject buttons */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                          {version.status !== 'approved' && (
                            <button
                              onClick={() => handleStatusChange(version.id, 'approved')}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-green-400 border border-green-500/30 hover:bg-green-500/10 transition-colors"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Approuver
                            </button>
                          )}
                          {version.status !== 'rejected' && (
                            <button
                              onClick={() => handleStatusChange(version.id, 'rejected')}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Rejeter
                            </button>
                          )}
                          {version.status !== 'draft' && (
                            <button
                              onClick={() => handleStatusChange(version.id, 'draft')}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Remettre en draft
                            </button>
                          )}
                        </div>

                        {version.ai_summary && (
                          <p className="mt-3 text-sm text-muted-foreground border-t border-border pt-2">
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
            <div className="text-center py-24 rounded-xl border-2 border-dashed border-border">
              <FileImage className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg text-muted-foreground">
                Sélectionnez un asset pour voir ses versions
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Puis glissez-déposez un fichier SVG pour créer une version
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
