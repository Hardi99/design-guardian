'use client';

import { useRef, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';

interface UseDragDropOptions {
  selectedAssetId: string | null;
  onUploadComplete: () => void;
  onError: (message: string) => void;
}

export function useDragDrop({ selectedAssetId, onUploadComplete, onError }: UseDragDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const uploadFile = useCallback(async (file: File, assetId: string) => {
    if (!file.name.endsWith('.svg') && file.type !== 'image/svg+xml') {
      onError('Seuls les fichiers SVG sont acceptés');
      return;
    }
    setUploading(true);
    try {
      await apiClient.uploadVersion(assetId, file);
      onUploadComplete();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [onUploadComplete, onError]);

  const handleUploadClick = useCallback((assetId: string) => {
    fileInputRef.current?.click();
    // Store the asset ID for the file input change handler
    fileInputRef.current?.setAttribute('data-asset-id', assetId);
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const assetId = e.target.getAttribute('data-asset-id');
    if (!file || !assetId) return;
    uploadFile(file, assetId);
  }, [uploadFile]);

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

    if (selectedAssetId) {
      uploadFile(file, selectedAssetId);
    } else {
      onError('Sélectionnez un asset avant de déposer un fichier');
    }
  }, [selectedAssetId, uploadFile, onError]);

  return {
    isDragging,
    uploading,
    fileInputRef,
    handleUploadClick,
    handleFileChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    uploadFile,
  };
}
