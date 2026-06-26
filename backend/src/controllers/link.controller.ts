import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient } from '../config/supabase.js';
import { getEnv } from '../config/env.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { newCode, newToken, hashToken, linkStatus } from '../services/link.service.js';
import { linkStartSchema, linkApproveSchema } from '../types/api.js';
import type { ErrorResponse } from '../types/api.js';

const linkRouter = new Hono();

const CODE_TTL_MS = 10 * 60 * 1000;

// Anti-abus : /start crée une ligne (coût DB) ; plafond glissant par projet (mémoire process).
const _bucket = new Map<string, { n: number; resetAt: number }>();
function rateLimited(projectId: string): boolean {
  const now = Date.now();
  const b = _bucket.get(projectId);
  if (!b || b.resetAt < now) { _bucket.set(projectId, { n: 1, resetAt: now + 3_600_000 }); return false; }
  if (b.n >= 30) return true;
  b.n++;
  return false;
}

// POST /api/link/start — le plugin demande un code (auth X-API-Key).
linkRouter.post('/start', pluginMiddleware, zValidator('json', linkStartSchema), async (c) => {
  const projectId = (c as unknown as { get: (k: string) => string }).get('projectId');
  if (rateLimited(projectId)) return c.json<ErrorResponse>({ error: 'Rate limit exceeded' }, 429);
  const { figma_user_id, figma_user_name } = c.req.valid('json');
  const code = newCode();
  const expires_at = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error } = await getSupabaseClient().from('device_links').insert({
    code, figma_user_id, figma_user_name: figma_user_name ?? null, expires_at,
  });
  if (error) return c.json<ErrorResponse>({ error: 'Failed to start link', details: error.message }, 500);

  const base = getEnv().WEBAPP_URL || '';
  return c.json({ code, approve_url: `${base}/link?code=${code}`, expires_at }, 201);
});

// GET /api/link/status?code= — le plugin poll (auth X-API-Key). Livre le token UNE fois.
linkRouter.get('/status', pluginMiddleware, async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json<ErrorResponse>({ error: 'code required' }, 400);

  const db = getSupabaseClient();
  const { data: row } = await db
    .from('device_links')
    .select('profile_id, token_hash, pending_token, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (!row) return c.json({ status: 'expired' as const });
  const status = linkStatus(row, new Date());
  // Livraison du token : le plaintext (pending_token) n'est renvoyé qu'ici, puis nullé
  // (le durable reste token_hash, hashé). La paire lecture+update n'est pas atomique, mais
  // c'est ACCEPTÉ : seul le plugin d'origine détient X-API-Key + code (16 octets aléatoires)
  // et poll en série → au pire le MÊME token est renvoyé 2× au MÊME client. Une garantie
  // stricte exigerait un UPDATE…RETURNING via RPC Postgres — disproportionné ici (YAGNI).
  if (status === 'approved' && row.pending_token) {
    await db.from('device_links').update({ pending_token: null }).eq('code', code);
    return c.json({ status, link_token: row.pending_token as string });
  }
  return c.json({ status });
});

// GET /api/link/info?code= — la webapp affiche qui demande le lien (auth JWT).
linkRouter.get('/info', authMiddleware, async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json<ErrorResponse>({ error: 'code required' }, 400);
  const { data: row } = await getSupabaseClient()
    .from('device_links').select('figma_user_name, profile_id, token_hash, expires_at').eq('code', code).maybeSingle();
  if (!row) return c.json({ status: 'expired' as const, figma_user_name: null });
  return c.json({ status: linkStatus(row, new Date()), figma_user_name: row.figma_user_name ?? null });
});

// POST /api/link/approve — la webapp confirme (auth JWT). profile_id = utilisateur authentifié.
linkRouter.post('/approve', authMiddleware, zValidator('json', linkApproveSchema), async (c) => {
  const userId = (c as unknown as { get: (k: string) => string }).get('userId');
  const { code } = c.req.valid('json');
  const db = getSupabaseClient();

  const { data: row } = await db
    .from('device_links').select('id, figma_user_id, figma_user_name, profile_id, token_hash, expires_at').eq('code', code).maybeSingle();
  if (!row) return c.json<ErrorResponse>({ error: 'Invalid code' }, 404);
  if (linkStatus(row, new Date()) === 'expired') return c.json<ErrorResponse>({ error: 'Code expired' }, 410);
  if (row.profile_id) return c.json<ErrorResponse>({ error: 'Already linked' }, 409);

  // Un seul lien actif par utilisateur Figma : révoquer les liens approuvés antérieurs.
  const { error: revokeErr } = await db.from('device_links').delete().eq('figma_user_id', row.figma_user_id).not('token_hash', 'is', null);
  if (revokeErr) console.error('[link] failed to revoke prior links:', revokeErr.message);

  const { token, hash } = newToken();
  const { error } = await db.from('device_links').update({
    profile_id: userId, token_hash: hash, pending_token: token, approved_at: new Date().toISOString(),
  }).eq('id', row.id);
  if (error) return c.json<ErrorResponse>({ error: 'Failed to approve', details: error.message }, 500);

  return c.json({ ok: true, figma_user_name: row.figma_user_name ?? null });
});

// GET /api/link/me — le plugin vérifie son lien (auth X-Link-Token).
linkRouter.get('/me', async (c) => {
  const token = c.req.header('X-Link-Token');
  if (!token) return c.json({ linked: false, plan: 'free' });
  const db = getSupabaseClient();
  const { data: link } = await db
    .from('device_links').select('profile_id').eq('token_hash', hashToken(token)).not('profile_id', 'is', null).maybeSingle();
  if (!link?.profile_id) return c.json({ linked: false, plan: 'free' });
  const { data: profile } = await db.from('profiles').select('plan').eq('id', link.profile_id).maybeSingle();
  return c.json({ linked: true, plan: (profile?.plan as string) ?? 'free' });
});

export { linkRouter };
