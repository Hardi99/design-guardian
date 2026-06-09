'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { apiClient } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';

interface Props {
  plan: 'pro' | 'team';
  label: string;
  href?: string;
  className: string;
}

export function CheckoutButton({ plan, label, href, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  if (href) {
    return <Link href={href} className={className}>{label}</Link>;
  }

  const handleClick = async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setLoading(false);
        router.push('/login?next=/pricing');
        return;
      }
      const url = await apiClient.createCheckout(plan);
      window.location.href = url;
    } catch {
      setError('Le paiement n’a pas pu démarrer. Réessayez.');
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleClick} disabled={loading} className={className}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
}
