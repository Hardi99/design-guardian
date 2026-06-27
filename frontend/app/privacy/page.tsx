export const metadata = { title: 'Politique de confidentialité — Design Guardian' };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-foreground space-y-8">
      <p><a href="/" className="text-sm text-muted-foreground hover:text-foreground">← Accueil</a></p>
      <h1 className="text-3xl font-bold">Politique de confidentialité</h1>
      <p className="text-muted-foreground">Dernière mise à jour : 27 juin 2026.</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Données traitées</h2>
        <p>
          Design Guardian enregistre des <strong>propriétés géométriques natives</strong> de vos éléments Figma
          (positions, dimensions, couleurs, contours, chemins vectoriels, typographie) — le « snapshot ». Nous ne
          stockons <strong>pas</strong> votre fichier Figma source ni son rendu original. L&apos;attribution utilise{' '}
          <code className="text-sm bg-muted px-1 rounded">figma.currentUser</code> (identifiant, nom, avatar). Pour les
          comptes : email, plan d&apos;abonnement et identifiants de facturation Stripe.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Sous-traitants</h2>
        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
          <li>Supabase — base de données et stockage (région UE)</li>
          <li>Railway — hébergement du backend (traitement des requêtes)</li>
          <li>OpenAI — génération du résumé de changements (données minimisées : delta synthétique)</li>
          <li>Stripe — paiement et abonnements</li>
          <li>Resend — emails transactionnels ; Twilio — SMS de vérification</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Finalités et base légale</h2>
        <p>
          Exécution du service de versioning (contrat), facturation (contrat), notifications (intérêt légitime ou
          consentement). Vos designs restent votre propriété.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Conservation</h2>
        <p>
          Les données sont conservées tant que votre compte ou votre projet existe, puis supprimées sur demande.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Vos droits (RGPD)</h2>
        <p>
          Vous disposez des droits d&apos;accès, de rectification, d&apos;<strong>effacement</strong>, de portabilité et
          d&apos;opposition. La suppression (compte ou données d&apos;un fichier, incluant les snapshots et le stockage associé)
          est effectuée <strong>sur demande</strong> sous 30 jours. Vos données de profil ne sont accessibles qu&apos;à
          vous (isolation par règles de sécurité au niveau ligne).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          Pour toute demande (dont l&apos;effacement) :{' '}
          <a href="mailto:design-guardian@proton.me" className="text-primary hover:underline">
            design-guardian@proton.me
          </a>.
        </p>
      </section>
    </div>
  );
}
