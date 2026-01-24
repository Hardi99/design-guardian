'use client';

import { useState } from 'react';
import { SVGViewer } from '@/components/SVGViewer';
import { DiffVisualizer } from '@/components/DiffVisualizer';
import { Header } from '@/components/ui/header';
import { ArrowLeft, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { AnalysisResult } from '@/lib/types';

const sampleSVG1 = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="80" fill="#3b82f6" />
  <rect x="60" y="60" width="80" height="80" fill="#10b981" opacity="0.5" />
</svg>`;

const sampleSVG2 = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="90" fill="#3b82f6" />
  <rect x="50" y="50" width="100" height="100" fill="#10b981" opacity="0.7" />
</svg>`;

const sampleAnalysis: AnalysisResult = {
  total_changes: 4,
  changes: [
    {
      element_id: 'circle_1',
      type: 'geometry_modified',
      severity: 'moderate',
      details: {
        property: 'radius',
        old_value: 80,
        new_value: 90,
        distance: 10,
        percentage: 12.5,
      },
    },
    {
      element_id: 'rect_1',
      type: 'geometry_modified',
      severity: 'minor',
      details: {
        property: 'position',
        distance: 14.14,
        percentage: 7.07,
      },
    },
    {
      element_id: 'rect_1',
      type: 'attribute_changed',
      severity: 'minor',
      details: {
        property: 'opacity',
        old_value: 0.5,
        new_value: 0.7,
      },
    },
  ],
  metadata: {
    v1_elements_count: 2,
    v2_elements_count: 2,
    epsilon: 0.01,
    processing_time_ms: 42,
  },
};

const sampleAISummary = `Cette version présente 4 modifications :

1. Le cercle a été agrandi de 12.5% (rayon de 80px à 90px) - changement modéré qui améliore la visibilité
2. Le rectangle a été déplacé et agrandi - les dimensions passent de 80x80 à 100x100
3. L'opacité du rectangle a été augmentée de 0.5 à 0.7, rendant l'élément plus visible

Ces changements suggèrent une volonté d'améliorer la lisibilité globale de l'asset.`;

export default function DemoPage() {
  const [showComparison, setShowComparison] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header
        links={[{ href: "/", label: "Accueil" }]}
        cta={{ href: "/login", label: "Commencer" }}
      />

      {/* Main */}
      <main className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Title */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm text-primary-light mb-4">
              <Sparkles className="h-4 w-4" />
              Démo Interactive
            </div>
            <h1 className="font-display text-4xl font-bold mb-4">
              <span className="text-gradient">Analyse en action</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Voyez comment Design Guardian détecte les changements géométriques
              dans les fichiers SVG
            </p>
          </div>

          {!showComparison ? (
            <div className="max-w-3xl mx-auto">
              <div className="glow-border rounded-xl bg-card/50 p-8">
                <h2 className="font-display text-2xl font-semibold text-center mb-4">
                  Comparaison de deux versions
                </h2>
                <p className="text-muted-foreground text-center mb-8">
                  Deux versions d&apos;un même SVG. Cliquez pour analyser les
                  différences géométriques.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <SVGViewer svgContent={sampleSVG1} label="Version 1" />
                  <SVGViewer svgContent={sampleSVG2} label="Version 2" />
                </div>

                <div className="text-center">
                  <button
                    onClick={() => setShowComparison(true)}
                    className="btn-shine inline-flex items-center gap-2 rounded-lg px-8 py-4 font-semibold text-primary-foreground shadow-glow hover:shadow-glow-lg transition-shadow"
                  >
                    <Search className="h-5 w-5" />
                    Analyser les différences
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-6 text-center">
                <button
                  onClick={() => setShowComparison(false)}
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Retour à l&apos;aperçu
                </button>
              </div>

              <DiffVisualizer
                svg1={sampleSVG1}
                svg2={sampleSVG2}
                analysis={sampleAnalysis}
                aiSummary={sampleAISummary}
              />

              {/* CTA */}
              <div className="mt-12 text-center glow-border rounded-xl bg-card/50 p-8">
                <h3 className="font-display text-2xl font-bold mb-4">
                  Prêt à tester avec{' '}
                  <span className="text-gradient">vos SVG</span> ?
                </h3>
                <p className="text-muted-foreground mb-6">
                  Créez un compte gratuit pour uploader vos assets et suivre les
                  changements avec l&apos;IA
                </p>
                <Link
                  href="/login"
                  className="btn-shine inline-flex items-center gap-2 rounded-lg px-8 py-4 font-semibold text-primary-foreground shadow-glow"
                >
                  Créer un compte gratuit
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Design Guardian © 2025 - Projet M2
          </p>
        </div>
      </footer>
    </div>
  );
}
