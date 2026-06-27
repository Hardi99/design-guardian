import { createClient } from '@/lib/supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

class APIClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async createCheckout(plan: 'pro' | 'team', interval: 'monthly' | 'yearly' = 'monthly'): Promise<string> {
    const origin = window.location.origin;
    const res = await fetch(`${this.baseURL}/api/payments/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.authHeaders()) },
      body: JSON.stringify({
        plan,
        interval,
        success_url: `${origin}/dashboard?checkout=success`,
        cancel_url: `${origin}/pricing`,
      }),
    });
    if (!res.ok) throw new Error('Failed to start checkout');
    const data = await res.json();
    return data.url as string;
  }

  async createPortalSession(): Promise<string> {
    const res = await fetch(`${this.baseURL}/api/payments/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.authHeaders()) },
      body: JSON.stringify({ return_url: `${window.location.origin}/dashboard` }),
    });
    if (!res.ok) throw new Error('Failed to open billing portal');
    const data = await res.json();
    return data.url as string;
  }

  async getLinkInfo(code: string): Promise<{ figma_user_name: string | null; status: string }> {
    const res = await fetch(`${this.baseURL}/api/link/info?code=${encodeURIComponent(code)}`, {
      headers: { ...(await this.authHeaders()) },
    });
    if (!res.ok) throw new Error('Lien invalide ou expiré.');
    return res.json();
  }

  async approveLink(code: string): Promise<{ ok: boolean; figma_user_name: string | null }> {
    const res = await fetch(`${this.baseURL}/api/link/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.authHeaders()) },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error('Échec de la liaison.');
    return res.json();
  }
}

export const apiClient = new APIClient(API_URL);
