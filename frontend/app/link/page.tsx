'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiClient } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

export default function LinkPage() {
  const [figmaName, setFigmaName] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    (async () => {
      const c = new URLSearchParams(window.location.search).get('code') ?? '';
      setCode(c);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Non connecté : magic-link puis retour ici via /auth/callback?next=...
        window.location.href = `/login?next=${encodeURIComponent(`/link?code=${c}`)}`;
        return;
      }
      if (!c) { setState('error'); setMessage('Code manquant.'); return; }
      try {
        const info = await apiClient.getLinkInfo(c);
        if (info.status !== 'pending') { setState('error'); setMessage('Lien déjà utilisé ou expiré.'); return; }
        setFigmaName(info.figma_user_name);
        setState('ready');
      } catch (e) { setState('error'); setMessage((e as Error).message); }
    })();
  }, []);

  const confirm = async () => {
    setConfirming(true);
    try { await apiClient.approveLink(code); setState('done'); }
    catch (e) { setState('error'); setMessage((e as Error).message); }
    finally { setConfirming(false); }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <Card>
        <CardHeader><CardTitle>Lier le plugin Figma</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>}
          {state === 'ready' && (
            <>
              <p className="text-sm text-muted-foreground">
                Lier le plugin de <strong>{figmaName ?? 'cet utilisateur Figma'}</strong> à votre compte ? Vos checkpoints utiliseront votre abonnement.
              </p>
              <Button onClick={confirm} disabled={confirming}>
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmer la liaison'}
              </Button>
            </>
          )}
          {state === 'done' && <Alert className="border-green-500/40"><AlertDescription>✓ Plugin lié. Retournez dans Figma — votre plan est actif.</AlertDescription></Alert>}
          {state === 'error' && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
        </CardContent>
      </Card>
    </div>
  );
}
