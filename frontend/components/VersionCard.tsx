'use client';

import type { Version } from '@/lib/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, Layers, Loader2, Type } from 'lucide-react';

interface VersionCardProps {
  version: Version;
  canCompare: boolean;
  compareLabel?: string;
  comparing: boolean;
  onCompare: () => void;
  onStatusChange: (versionId: string, status: 'approved' | 'rejected' | 'draft') => void;
  onViewFont?: (versionId: string) => void;
}

function isFont(version: Version): boolean {
  const analysis = version.analysis_json as { type?: string } | null;
  return analysis?.type === 'font';
}

const statusConfig = {
  approved: {
    badge: <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-500/10"><CheckCircle className="h-3 w-3 mr-1" />Gold</Badge>,
    cardClass: 'border-green-500/30 bg-green-500/5',
  },
  rejected: {
    badge: <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-500/10"><XCircle className="h-3 w-3 mr-1" />Rejet&eacute;</Badge>,
    cardClass: 'border-red-500/30 bg-red-500/5',
  },
  draft: {
    badge: <Badge variant="outline" className="border-muted-foreground/50 text-muted-foreground"><Clock className="h-3 w-3 mr-1" />Draft</Badge>,
    cardClass: 'border-border bg-card/50',
  },
} as const;

export function VersionCard({ version, canCompare, compareLabel, comparing, onCompare, onStatusChange, onViewFont }: VersionCardProps) {
  const config = statusConfig[version.status] || statusConfig.draft;
  const fontVersion = isFont(version);
  const fontAnalysis = version.analysis_json as { font_name?: string; glyph_count?: number } | null;

  return (
    <Card className={config.cardClass}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-medium">v{version.version_number}</span>
            {fontVersion && (
              <Badge variant="outline" className="border-purple-500/50 text-purple-400 bg-purple-500/10">
                <Type className="h-3 w-3 mr-1" />
                {fontAnalysis?.glyph_count || 0} glyphes
              </Badge>
            )}
            {config.badge}
            <span className="text-sm text-muted-foreground">
              {new Date(version.created_at).toLocaleString('fr-FR')}
            </span>
          </div>
          <div className="flex gap-2">
            {fontVersion && onViewFont && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewFont(version.id)}
              >
                <Type className="h-3 w-3 mr-1" />
                Specimen
              </Button>
            )}
            {canCompare && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCompare}
                disabled={comparing}
              >
                {comparing ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Layers className="h-3 w-3 mr-1" />
                )}
                {compareLabel}
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          {version.status !== 'approved' && (
            <Button
              variant="outline"
              size="sm"
              className="text-green-400 border-green-500/30 hover:bg-green-500/10"
              onClick={() => onStatusChange(version.id, 'approved')}
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              Approuver
            </Button>
          )}
          {version.status !== 'rejected' && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-400 border-red-500/30 hover:bg-red-500/10"
              onClick={() => onStatusChange(version.id, 'rejected')}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Rejeter
            </Button>
          )}
          {version.status !== 'draft' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStatusChange(version.id, 'draft')}
            >
              Remettre en draft
            </Button>
          )}
        </div>

        {version.ai_summary && (
          <p className="mt-3 text-sm text-muted-foreground border-t border-border pt-2">
            {version.ai_summary}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
