'use client';

import { CloudUpload } from 'lucide-react';

interface DropZoneProps {
  isDragging: boolean;
  assetName?: string;
}

export function DropZone({ isDragging, assetName }: DropZoneProps) {
  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="rounded-2xl border-2 border-dashed border-primary bg-primary/10 p-16 text-center">
        <CloudUpload className="h-16 w-16 text-primary mx-auto mb-4 animate-bounce" />
        <p className="text-xl font-semibold text-primary">
          Déposez votre fichier SVG
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          {assetName ? `Upload vers ${assetName}` : "Sélectionnez un asset d'abord"}
        </p>
      </div>
    </div>
  );
}
