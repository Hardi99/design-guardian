export const metadata = { title: 'Conditions générales — Design Guardian' };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-foreground space-y-8">
      <h1 className="text-3xl font-bold">Conditions générales d&apos;utilisation</h1>
      <p className="text-muted-foreground">Dernière mise à jour : 27 juin 2026.</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Objet</h2>
        <p>
          Design Guardian est un plugin Figma de gestion de versions (checkpoints, diff géométrique, résumé IA).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Comptes</h2>
        <p>
          L&apos;accès aux fonctions payantes nécessite un compte. Vous êtes responsable de la confidentialité de vos accès.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Abonnements et paiement</h2>
        <p>
          Plans : Free (0 €), Pro (12 €/mois), Team (39 €/mois). Le paiement est traité par Stripe. La résiliation
          est possible à tout moment depuis le portail de facturation ; l&apos;abonnement reste actif jusqu&apos;à la fin de la
          période en cours.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Propriété</h2>
        <p>
          Vous conservez l&apos;entière propriété de vos designs et de leurs snapshots. Nous n&apos;acquérons aucun droit
          dessus au-delà de l&apos;hébergement nécessaire au service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Responsabilité</h2>
        <p>
          Le service est fourni « en l&apos;état ». Nous mettons en œuvre des moyens raisonnables de disponibilité et de
          sauvegarde, sans garantie d&apos;absence d&apos;interruption. Notre responsabilité est limitée au montant payé sur les
          12 derniers mois.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Droit applicable</h2>
        <p>Les présentes conditions sont régies par le droit français.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          <a href="mailto:design-guardian@proton.me" className="text-primary hover:underline">
            design-guardian@proton.me
          </a>
        </p>
      </section>
    </div>
  );
}
