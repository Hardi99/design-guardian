import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock env (getEnv cache l'env au 1er appel du process → mocker est plus fiable que process.env).
vi.mock('../config/env.js', () => ({
  getEnv: () => ({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key' }),
}));

import { broadcastSummary } from '../services/realtime.service.js';

afterEach(() => vi.restoreAllMocks());

describe('broadcastSummary', () => {
  it('POST /realtime/v1/api/broadcast avec topic=checkpoint:{id}, event=summary, apikey', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    await broadcastSummary('v-123', 'Le bouton a bougé de 4px.');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/realtime/v1/api/broadcast');
    expect((init.headers as Record<string, string>).apikey).toBe('anon-key');
    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toMatchObject({
      topic: 'checkpoint:v-123', event: 'summary', payload: { ai_summary: 'Le bouton a bougé de 4px.' },
    });
  });

  it("best-effort : ne lève pas si fetch échoue", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    await expect(broadcastSummary('v-1', 's')).resolves.toBeUndefined();
  });
});
