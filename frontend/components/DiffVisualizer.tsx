'use client';

import { useState } from 'react';
import { SVGViewer } from './SVGViewer';

interface DiffVisualizerProps {
  svg1: string;
  svg2: string;
  analysis?: any;
  aiSummary?: string;
}

export function DiffVisualizer({ svg1, svg2, analysis, aiSummary }: DiffVisualizerProps) {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'overlay'>('side-by-side');

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Comparison</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('side-by-side')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              viewMode === 'side-by-side'
                ? 'bg-black dark:bg-white text-white dark:text-black'
                : 'border border-gray-300 dark:border-gray-700'
            }`}
          >
            Side by Side
          </button>
          <button
            onClick={() => setViewMode('overlay')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              viewMode === 'overlay'
                ? 'bg-black dark:bg-white text-white dark:text-black'
                : 'border border-gray-300 dark:border-gray-700'
            }`}
          >
            Overlay
          </button>
        </div>
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🤖</div>
            <div>
              <h3 className="font-semibold mb-2">AI Analysis</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">{aiSummary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Visual Comparison */}
      {viewMode === 'side-by-side' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SVGViewer svgContent={svg1} label="Version 1" />
          <SVGViewer svgContent={svg2} label="Version 2" />
        </div>
      ) : (
        <div className="relative">
          <div className="absolute inset-0 opacity-50">
            <SVGViewer svgContent={svg1} label="Version 1 (Background)" />
          </div>
          <div className="relative opacity-75">
            <SVGViewer svgContent={svg2} label="Version 2 (Foreground)" />
          </div>
        </div>
      )}

      {/* Technical Analysis */}
      {analysis && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <h3 className="font-semibold mb-4">Technical Details</h3>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {analysis.total_changes || 0}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Changes</div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {analysis.metadata?.processing_time_ms || 0}ms
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Processing Time</div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {analysis.metadata?.epsilon || 0.01}px
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Tolerance</div>
            </div>
          </div>

          {/* Changes List */}
          {analysis.changes && analysis.changes.length > 0 && (
            <div>
              <h4 className="font-medium mb-3">Changes Detected:</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {analysis.changes.map((change: any, index: number) => (
                  <div
                    key={index}
                    className="p-3 bg-gray-50 dark:bg-gray-900 rounded border-l-4 border-gray-400 dark:border-gray-600"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{change.element_id}</span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          change.severity === 'major'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            : change.severity === 'moderate'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        }`}
                      >
                        {change.severity}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {change.type}: {change.details?.property || 'N/A'}
                      {change.details?.distance && ` (${change.details.distance}px)`}
                      {change.details?.percentage && ` (${change.details.percentage}%)`}
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
