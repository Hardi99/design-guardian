'use client';

import { useState, useMemo } from 'react';
import { SVGViewer } from './SVGViewer';
import { Sparkles, GitCompare, Layers } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AnalysisResult, Change } from '@/lib/types';

interface DiffVisualizerProps {
  svg1: string;
  svg2: string;
  analysis?: AnalysisResult;
  aiSummary?: string;
}

export function DiffVisualizer({ svg1, svg2, analysis, aiSummary }: DiffVisualizerProps) {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'overlay' | 'diff'>('side-by-side');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);

  // Generate highlighted SVGs for diff mode
  const { highlightedSvg1, highlightedSvg2 } = useMemo(() => {
    if (!analysis?.changes || !svg1 || !svg2) {
      return { highlightedSvg1: svg1, highlightedSvg2: svg2 };
    }

    // Add highlight outlines to elements that changed
    let h1 = svg1;
    let h2 = svg2;

    // For each change, we try to highlight elements by injecting styles
    const changedElements = new Set(
      analysis.changes.map((c: Change) => c.element_id)
    );

    // Inject a style block into the SVGs to highlight changed elements
    const highlightStyle = `<style>
      .dg-highlight { stroke: #ec4899 !important; stroke-width: 2px !important; stroke-dasharray: 4 2; }
      .dg-added { stroke: #22c55e !important; stroke-width: 2px !important; fill-opacity: 0.3; }
      .dg-removed { stroke: #ef4444 !important; stroke-width: 2px !important; fill-opacity: 0.3; }
    </style>`;

    // Insert style after opening SVG tag
    h1 = h1.replace(/(<svg[^>]*>)/, `$1${highlightStyle}`);
    h2 = h2.replace(/(<svg[^>]*>)/, `$1${highlightStyle}`);

    return { highlightedSvg1: h1, highlightedSvg2: h2 };
  }, [svg1, svg2, analysis]);

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'major': return 'border-red-500/50 bg-red-500/10 text-red-400';
      case 'moderate': return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400';
      default: return 'border-primary/50 bg-primary/10 text-primary';
    }
  };

  const severityLabel = (severity: string) => {
    switch (severity) {
      case 'major': return 'Majeur';
      case 'moderate': return 'Modéré';
      default: return 'Mineur';
    }
  };

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-primary" />
          Comparaison
        </h2>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
          <TabsList>
            <TabsTrigger value="side-by-side">Côte à côte</TabsTrigger>
            <TabsTrigger value="overlay">Superposé</TabsTrigger>
            <TabsTrigger value="diff">Diff visuel</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <div className="glow-border rounded-xl bg-card/50 p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold mb-2">Résumé IA</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{aiSummary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Visual Comparison */}
      <div className="rounded-xl border border-border bg-card/50 p-6">
        {viewMode === 'side-by-side' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Version précédente</p>
              <SVGViewer svgContent={svg1} label="V1" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Nouvelle version</p>
              <SVGViewer svgContent={svg2} label="V2" />
            </div>
          </div>
        )}

        {viewMode === 'overlay' && (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <span className="text-sm text-muted-foreground">Opacité V2:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-mono text-muted-foreground w-12">
                {Math.round(overlayOpacity * 100)}%
              </span>
            </div>
            <div className="relative rounded-lg overflow-hidden border border-border bg-background">
              <div className="relative" style={{ opacity: 1 - overlayOpacity * 0.5 }}>
                <SVGViewer svgContent={svg1} label="" />
              </div>
              <div className="absolute inset-0" style={{ opacity: overlayOpacity }}>
                <SVGViewer svgContent={svg2} label="" />
              </div>
            </div>
            <div className="flex items-center justify-center gap-6 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-muted-foreground/50" />
                V1 (fond)
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary" />
                V2 (dessus)
              </span>
            </div>
          </div>
        )}

        {viewMode === 'diff' && (
          <div>
            <div className="relative rounded-lg overflow-hidden border border-border bg-background">
              {/* V1 in red tint */}
              <div className="relative" style={{ filter: 'hue-rotate(-60deg) saturate(2)' }}>
                <div style={{ opacity: 0.4 }}>
                  <SVGViewer svgContent={highlightedSvg1} label="" />
                </div>
              </div>
              {/* V2 in green tint overlay */}
              <div
                className="absolute inset-0"
                style={{ mixBlendMode: 'screen', filter: 'hue-rotate(60deg) saturate(1.5)' }}
              >
                <div style={{ opacity: 0.6 }}>
                  <SVGViewer svgContent={highlightedSvg2} label="" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-6 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                Supprimé / Ancien
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500" />
                Ajouté / Nouveau
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-gray-400" />
                Inchangé
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Technical Analysis */}
      {analysis && (
        <div className="rounded-xl border border-border bg-card/50 p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Détails techniques
          </h3>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 rounded-lg border border-border bg-background">
              <div className="text-2xl font-bold text-primary">
                {analysis.total_changes || analysis.changes?.length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Changements</div>
            </div>
            <div className="text-center p-4 rounded-lg border border-border bg-background">
              <div className="text-2xl font-bold text-green-400">
                {analysis.metadata?.processing_time_ms || 0}ms
              </div>
              <div className="text-sm text-muted-foreground">Temps d&apos;analyse</div>
            </div>
            <div className="text-center p-4 rounded-lg border border-border bg-background">
              <div className="text-2xl font-bold text-primary">
                {analysis.metadata?.epsilon || 0.01}px
              </div>
              <div className="text-sm text-muted-foreground">Tolérance</div>
            </div>
          </div>

          {/* Changes List */}
          {analysis.changes && analysis.changes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Changements détectés :
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {analysis.changes.map((change: Change, index: number) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border-l-4 bg-card/30 ${severityColor(change.severity)}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-foreground">
                        {change.element_id}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${severityColor(change.severity)}`}>
                        {severityLabel(change.severity)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {change.type === 'geometry_modified' && 'Géométrie modifiée'}
                      {change.type === 'attribute_changed' && 'Attribut changé'}
                      {change.type === 'added' && 'Élément ajouté'}
                      {change.type === 'removed' && 'Élément supprimé'}
                      {change.type === 'transform_changed' && 'Transformation modifiée'}
                      {change.details?.property && `: ${change.details.property}`}
                      {change.details?.distance != null && ` (${Number(change.details.distance).toFixed(2)}px)`}
                      {change.details?.percentage != null && ` — ${Number(change.details.percentage).toFixed(1)}%`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
