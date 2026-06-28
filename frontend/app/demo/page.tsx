import { Header } from '@/components/ui/header';
import { Camera, GitCompare, RotateCcw, Sparkles } from 'lucide-react';
import Link from 'next/link';

const PLUGIN_URL = 'https://www.figma.com/community/plugin/1621623685015334277';

const steps = [
  {
    icon: Camera,
    title: 'Checkpoint',
    body: "Capturez l'état exact d'une frame en un clic. Design Guardian enregistre les propriétés géométriques natives (positions, tailles, couleurs, contours, typo) — au pixel près.",
  },
  {
    icon: GitCompare,
    title: 'Diff géométrique 0,01px',
    body: 'Comparez deux versions propriété par propriété, avec attribution par élément (qui a changé quoi). On montre ce qui a été touché à la main, pas les conséquences dérivées.',
  },
  {
    icon: RotateCcw,
    title: 'Restore + Gold',
    body: "Restaurez une version antérieure à l'identique, et validez vos assets avec le statut Gold avant livraison — le tout sans quitter Figma.",
  },
];

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header
        links={[{ href: '/', label: 'Accueil' }]}
        cta={{ href: '/login', label: 'Commencer' }}
      />

      <main className="py-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm text-primary-light mb-4">
              <Sparkles className="h-4 w-4" />
              Le produit vit dans Figma
            </div>
            <h1 className="font-display text-4xl font-bold mb-4">
              <span className="text-gradient">Design Guardian, dans Figma</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Le versioning géométrique au pixel près est un plugin Figma — le diff
              dépend de l&apos;API Figma et fonctionne donc directement dans l&apos;outil.
              Voici le flux, en trois temps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {steps.map(({ icon: Icon, title, body }) => (
              <div key={title} className="glow-border rounded-xl bg-card/50 p-6 flex flex-col gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary-light" />
                </div>
                <h2 className="font-display text-lg font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          <div className="text-center glow-border rounded-xl bg-card/50 p-8">
            <h3 className="font-display text-2xl font-bold mb-4">
              Essayez-le sur vos{' '}
              <span className="text-gradient">designs Figma</span>
            </h3>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Installez le plugin depuis Figma Community, puis créez un compte pour
              débloquer les checkpoints illimités et la facturation.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={PLUGIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-shine inline-flex items-center gap-2 rounded-lg px-8 py-4 font-semibold text-primary-foreground shadow-glow"
              >
                Installer le plugin
              </a>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-8 py-4 font-semibold hover:bg-card transition-colors"
              >
                Créer un compte
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-sm text-muted-foreground">Design Guardian © 2026</p>
        </div>
      </footer>
    </div>
  );
}
