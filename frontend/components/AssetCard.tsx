'use client';

import type { Asset } from '@/lib/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileImage, Upload } from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  isSelected: boolean;
  onSelect: (assetId: string) => void;
  onUpload: (assetId: string) => void;
}

export function AssetCard({ asset, isSelected, onSelect, onUpload }: AssetCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card/50 hover:border-primary/30'
      }`}
      onClick={() => onSelect(asset.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileImage className="h-5 w-5 text-primary" />
            <span className="font-medium text-sm">{asset.name}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onUpload(asset.id);
            }}
            title="Uploader une version"
          >
            <Upload className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
