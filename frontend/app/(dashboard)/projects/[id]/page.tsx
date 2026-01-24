'use client';

import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '@/hooks/useProject';
import { useDragDrop } from '@/hooks/useDragDrop';
import { DiffVisualizer } from '@/components/DiffVisualizer';
import { VersionCard } from '@/components/VersionCard';
import { AssetCard } from '@/components/AssetCard';
import { DropZone } from '@/components/DropZone';
import Link from 'next/link';
import { useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  Plus,
  Upload,
  FileImage,
  Loader2,
  CloudUpload,
} from 'lucide-react';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const {
    project,
    assets,
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
  } = useProject(id);

  const [newAssetName, setNewAssetName] = useState('');
  const [creatingAsset, setCreatingAsset] = useState(false);

  const onUploadComplete = useCallback(() => {
    loadProject();
    if (selectedAsset) {
      loadVersions(selectedAsset.id);
    }
  }, [loadProject, selectedAsset, loadVersions]);

  const {
    isDragging,
    uploading,
    fileInputRef,
    handleUploadClick,
    handleFileChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useDragDrop({
    selectedAssetId: selectedAsset?.id || null,
    onUploadComplete,
    onError: setError,
  });

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetName.trim()) return;
    setCreatingAsset(true);
    try {
      await apiClient.createAsset(id, newAssetName.trim());
      setNewAssetName('');
      loadProject();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de création');
    } finally {
      setCreatingAsset(false);
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
        <Alert variant="destructive" className="mb-6">
          <AlertDescription className="flex items-center justify-between">
            {error}
            <button onClick={clearError} className="underline text-sm ml-4">Fermer</button>
          </AlertDescription>
        </Alert>
      )}

      {/* Upload loading */}
      {uploading && (
        <Alert className="mb-6 border-primary/50 bg-primary/10">
          <AlertDescription className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Upload et analyse en cours...
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Assets */}
        <div className="lg:col-span-1">
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Nouvel Asset</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateAsset} className="flex gap-2">
                <Input
                  value={newAssetName}
                  onChange={(e) => setNewAssetName(e.target.value)}
                  placeholder="ex: logo-principal"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={creatingAsset || !newAssetName.trim()}
                >
                  {creatingAsset ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </form>
            </CardContent>
          </Card>

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
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  isSelected={selectedAsset?.id === asset.id}
                  onSelect={loadVersions}
                  onUpload={handleUploadClick}
                />
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
          <DropZone isDragging={isDragging} assetName={selectedAsset?.name} />

          {selectedAsset ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-semibold">
                  {selectedAsset.name}
                </h2>
                <Button onClick={() => handleUploadClick(selectedAsset.id)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Nouvelle version
                </Button>
              </div>

              {versions.length === 0 ? (
                <div
                  className="text-center py-16 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => handleUploadClick(selectedAsset.id)}
                >
                  <CloudUpload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-2">Glissez-déposez un SVG ici</p>
                  <p className="text-sm text-muted-foreground">ou cliquez pour parcourir</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    {versions.map((version, index) => (
                      <VersionCard
                        key={version.id}
                        version={version}
                        canCompare={index < versions.length - 1}
                        compareLabel={index < versions.length - 1 ? `Diff v${versions[index + 1]!.version_number}` : undefined}
                        comparing={comparing}
                        onCompare={() => {
                          if (index < versions.length - 1) {
                            handleCompare(versions[index + 1]!, version);
                          }
                        }}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>

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
