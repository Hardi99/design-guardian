'use client';

import { useEffect, useRef, useState } from 'react';

interface SVGViewerProps {
  svgContent: string;
  label?: string;
  className?: string;
}

export function SVGViewer({ svgContent, label, className = '' }: SVGViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      // Sanitize and inject SVG
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const svgElement = doc.querySelector('svg');

      if (!svgElement) {
        throw new Error('Invalid SVG content');
      }

      // Clear previous content
      containerRef.current.innerHTML = '';

      // Add responsive attributes
      svgElement.setAttribute('width', '100%');
      svgElement.setAttribute('height', '100%');
      svgElement.style.maxHeight = '500px';

      // Append to container
      containerRef.current.appendChild(svgElement);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to render SVG');
    }
  }, [svgContent]);

  return (
    <div className={className}>
      {label && (
        <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </div>
      )}
      <div
        ref={containerRef}
        className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-gray-950 flex items-center justify-center min-h-[200px]"
      >
        {error && (
          <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
        )}
      </div>
    </div>
  );
}
