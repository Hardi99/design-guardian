'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { apiClient } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, Puzzle } from 'lucide-react';

const FIGMA_PLUGIN_URL = 'https://www.figma.com/community/plugin/1621623685015334277';

type Plan = 'free' | 'pro' | 'team';

const PLAN_LABEL: Record<Plan, string> = { free: 'Free', pro: 'Pro', team: 'Team' };

export default function DashboardPage() {
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<Plan>('free');
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      setCheckoutSuccess(true);
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setEmail(user.email ?? '');
      const { data } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .single();
      setPlan(((data as { plan?: Plan } | null)?.plan) ?? 'free');
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    setError('');
    try {
      const url = await apiClient.createPortalSession();
      window.location.href = url;
    } catch {
      setError('Impossible d’ouvrir le portail de facturation.');
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-24">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      {checkoutSuccess && (
        <Alert className="mb-6 border-green-500/40">
          <AlertDescription>
            🎉 Abonnement activé. Votre compte est maintenant {PLAN_LABEL[plan]}.
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2">Mon compte</h1>
        <p className="text-muted-foreground">{email}</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Abonnement */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Abonnement
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Plan actuel</p>
            <p className="text-2xl font-bold">{PLAN_LABEL[plan]}</p>
          </div>
          {plan === 'free' ? (
            <Button asChild>
              <Link href="/pricing">Passer à Pro</Link>
            </Button>
          ) : (
            <Button onClick={handleManageSubscription} disabled={portalLoading}>
              {portalLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Gérer mon abonnement
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Plugin */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-primary" />
            Plugin Figma
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Le versioning se fait dans Figma. Installez le plugin pour capturer vos checkpoints.
          </p>
          <Button asChild variant="outline">
            <a href={FIGMA_PLUGIN_URL} target="_blank" rel="noopener noreferrer">
              Installer
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
