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
  const router = useRouter();

  if (href) {
    return <Link href={href} className={className}>{label}</Link>;
  }

  const handleClick = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push('/login?next=/pricing');
        return;
      }
      const url = await apiClient.createCheckout(plan);
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : label}
    </button>
  );
}
