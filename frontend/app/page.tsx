import { LightBeams } from "@/components/ui/light-beams";
import { Header } from "@/components/ui/header";
import { ArrowRight, Shield, GitCompare, Sparkles, Check } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-dot-pattern bg-dot opacity-30" />
      <div className="absolute inset-0 bg-glow" />
      <LightBeams />

      {/* Noise Overlay */}
      <div className="bg-noise absolute inset-0" />

      {/* Content */}
      <div className="relative z-10">
        <Header
          links={[
            { href: "/demo", label: "Démo" },
            { href: "/login", label: "Connexion" },
          ]}
          cta={{ href: "/login", label: "Essayer gratuitement" }}
        />

        {/* Hero Section */}
        <section className="mx-auto max-w-7xl px-6 pt-24 pb-32">
          <div className="text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm text-primary-light mb-8">
              <Sparkles className="h-4 w-4" />
              Semantic Vector Versioning
            </div>

            {/* Title */}
            <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight mb-6">
              <span className="text-gradient">Version Control</span>
              <br />
              <span className="text-foreground">pour vos assets Design</span>
            </h1>

            {/* Subtitle */}
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
              Détectez les micro-changements invisibles à l&apos;œil nu dans vos
              fichiers SVG grâce à une analyse géométrique avancée.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/demo"
                className="btn-shine inline-flex items-center gap-2 rounded-lg px-8 py-4 text-lg font-semibold text-primary-foreground shadow-glow hover:shadow-glow-lg transition-shadow"
              >
                Commencer gratuitement
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/50 px-8 py-4 text-lg font-medium hover:bg-card transition-colors"
              >
                Voir les fonctionnalités
              </Link>
            </div>

            {/* Trust Badge */}
            <p className="mt-8 text-sm text-muted-foreground">
              Utilisé par les équipes design de startups innovantes
            </p>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="border-t border-border/50 bg-card/30">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                <span className="text-gradient">Pourquoi</span> Design Guardian ?
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Les outils traditionnels comparent des pixels. Nous analysons la
                géométrie vectorielle.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="card-hover glow-border rounded-xl bg-card/50 p-8">
                <div className="mb-4 inline-flex items-center justify-center rounded-lg bg-primary/10 p-3">
                  <GitCompare className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-2">
                  Diff Géométrique
                </h3>
                <p className="text-muted-foreground">
                  Analyse mathématique des courbes de Bézier, coordonnées et
                  attributs SVG.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="card-hover glow-border rounded-xl bg-card/50 p-8">
                <div className="mb-4 inline-flex items-center justify-center rounded-lg bg-primary/10 p-3">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-2">
                  Résumé IA
                </h3>
                <p className="text-muted-foreground">
                  L&apos;IA traduit les changements techniques en langage naturel
                  compréhensible.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="card-hover glow-border rounded-xl bg-card/50 p-8">
                <div className="mb-4 inline-flex items-center justify-center rounded-lg bg-primary/10 p-3">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-2">
                  Quality Assurance
                </h3>
                <p className="text-muted-foreground">
                  Validez l&apos;intégrité de vos assets avant la mise en
                  production.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Precision Section */}
        <section className="border-t border-border/50">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-6">
                  Précision{" "}
                  <span className="text-gradient">au sous-pixel</span>
                </h2>
                <p className="text-muted-foreground mb-8">
                  Détectez des changements que l&apos;œil humain ne peut pas voir :
                </p>
                <ul className="space-y-4">
                  {[
                    "Déplacement de point de 0.5px",
                    "Courbe de Bézier modifiée de 2%",
                    "Changements d'attributs subtils",
                    "Modifications de stroke-width",
                  ].map((item, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <div className="flex-shrink-0 rounded-full bg-primary/20 p-1">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative">
                <div className="aspect-square rounded-2xl bg-card border border-border overflow-hidden">
                  <div className="absolute inset-0 bg-dot-pattern bg-dot opacity-50" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="font-display text-6xl font-bold text-gradient mb-2">
                        0.01px
                      </div>
                      <div className="text-muted-foreground">
                        Tolérance epsilon
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t border-border/50 bg-card/30">
          <div className="mx-auto max-w-7xl px-6 py-24 text-center">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-6">
              Prêt à sécuriser vos{" "}
              <span className="text-gradient">assets design</span> ?
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto mb-8">
              Commencez gratuitement et découvrez une nouvelle façon de gérer
              vos fichiers SVG.
            </p>
            <Link
              href="/demo"
              className="btn-shine inline-flex items-center gap-2 rounded-lg px-8 py-4 text-lg font-semibold text-primary-foreground shadow-glow hover:shadow-glow-lg transition-shadow"
            >
              Démarrer maintenant
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/50">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-medium">Design Guardian</span>
              </div>
              <p className="text-sm text-muted-foreground">
                © 2025 Design Guardian. Projet M2.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
