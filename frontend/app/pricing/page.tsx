import { Header } from "@/components/ui/header";
import { LightBeams } from "@/components/ui/light-beams";
import { Check, X } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: "0",
    period: "/ mois",
    description: "Pour découvrir Design Guardian.",
    cta: "Commencer gratuitement",
    ctaHref: "/login",
    featured: false,
    features: [
      { text: "1 projet Figma", included: true },
      { text: "10 checkpoints max", included: true },
      { text: "1 branche", included: true },
      { text: "Diff géométrique 0,01px", included: true },
      { text: "AI Patch Note", included: true },
      { text: "Historique illimité", included: false },
      { text: "Multi-branches", included: false },
      { text: "Export rapports", included: false },
    ],
  },
  {
    name: "Pro",
    price: "8",
    period: "/ mois",
    description: "Pour les designers sérieux.",
    cta: "Passer à Pro",
    ctaHref: "/login",
    featured: true,
    features: [
      { text: "Projets illimités", included: true },
      { text: "Checkpoints illimités", included: true },
      { text: "Branches illimitées", included: true },
      { text: "Diff géométrique 0,01px", included: true },
      { text: "AI Patch Note", included: true },
      { text: "Historique complet", included: true },
      { text: "Gold Status & workflow QA", included: true },
      { text: "Export rapports", included: false },
    ],
  },
  {
    name: "Team",
    price: "20",
    period: "/ user / mois",
    description: "Pour les équipes design.",
    cta: "Contacter l'équipe",
    ctaHref: "mailto:contact@design-guardian.io",
    featured: false,
    features: [
      { text: "Tout Pro", included: true },
      { text: "Multi-designers", included: true },
      { text: "Permissions par rôle", included: true },
      { text: "Export rapports PDF", included: true },
      { text: "Support prioritaire", included: true },
      { text: "Dashboard équipe", included: true },
      { text: "SSO (bientôt)", included: true },
      { text: "SLA 99,9 %", included: true },
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      <div className="absolute inset-0 bg-dot-pattern bg-dot opacity-30" />
      <div className="absolute inset-0 bg-glow" />
      <LightBeams />
      <div className="bg-noise absolute inset-0" />

      <div className="relative z-10">
        <Header
          links={[
            { href: "/demo", label: "Démo" },
            { href: "/login", label: "Connexion" },
          ]}
          cta={{ href: "/login", label: "Essayer gratuitement" }}
        />

        <section className="mx-auto max-w-6xl px-6 pt-24 pb-32">
          {/* Heading */}
          <div className="text-center mb-16">
            <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight mb-4">
              <span className="text-gradient">Tarifs simples</span>
              <br />
              <span className="text-foreground">et transparents</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Choisissez le plan qui correspond à votre usage. Annulation à tout moment.
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl border p-8 flex flex-col gap-6 ${
                  plan.featured
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                    Populaire
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1.5">
                    <span className="text-4xl font-bold">{plan.price} €</span>
                    <span className="text-muted-foreground text-sm mb-1">{plan.period}</span>
                  </div>
                  <p className="text-muted-foreground text-sm mt-2">{plan.description}</p>
                </div>

                <ul className="flex flex-col gap-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-center gap-2.5 text-sm">
                      {f.included ? (
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                      )}
                      <span className={f.included ? "text-foreground" : "text-muted-foreground/40"}>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.ctaHref}
                  className={`block text-center py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-85 ${
                    plan.featured
                      ? "bg-primary text-white"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-muted-foreground text-sm mt-10">
            Paiement sécurisé · TVA européenne incluse automatiquement · Annulation à tout moment
          </p>
        </section>
      </div>
    </div>
  );
}
