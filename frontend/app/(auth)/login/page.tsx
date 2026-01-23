'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Shield, ArrowLeft, Mail, CheckCircle, Loader2 } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-dot-pattern bg-dot opacity-20" />
      <div className="absolute inset-0 bg-glow" />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <Shield className="h-10 w-10 text-primary" />
            <span className="font-display text-2xl font-bold">Design Guardian</span>
          </div>

          {/* Login Card */}
          <div className="glow-border rounded-xl bg-card/50 backdrop-blur-sm p-8">
            {sent ? (
              <>
                <div className="flex justify-center mb-4">
                  <CheckCircle className="h-12 w-12 text-green-500" />
                </div>
                <h2 className="font-display text-2xl font-semibold text-center mb-2">
                  Vérifiez vos emails
                </h2>
                <p className="text-muted-foreground text-center mb-6">
                  Un lien de connexion a été envoyé à{' '}
                  <span className="text-foreground font-medium">{email}</span>
                </p>
                <p className="text-sm text-muted-foreground text-center">
                  Cliquez sur le lien dans l&apos;email pour vous connecter.
                  Si vous n&apos;avez pas de compte, il sera créé automatiquement.
                </p>
                <button
                  onClick={() => { setSent(false); setEmail(''); }}
                  className="mt-6 w-full rounded-lg border border-border bg-card/50 px-6 py-3 font-medium hover:bg-card transition-colors"
                >
                  Utiliser un autre email
                </button>
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl font-semibold text-center mb-2">
                  Connexion / Inscription
                </h2>
                <p className="text-muted-foreground text-center mb-8">
                  Entrez votre email pour recevoir un lien magique.
                  Pas de mot de passe nécessaire.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vous@exemple.com"
                        required
                        className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-red-400">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="btn-shine w-full rounded-lg px-6 py-3 font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      'Continuer avec Email'
                    )}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <Link
                    href="/demo"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Ou essayez la démo →
                  </Link>
                </div>
              </>
            )}
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à l&apos;accueil
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
