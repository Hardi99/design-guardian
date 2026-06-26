import { randomBytes, createHash } from 'node:crypto';

export function newCode(): string {
  return randomBytes(16).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

export type LinkStatus = 'pending' | 'approved' | 'expired';

/** Statut d'une ligne device_links. Approuvé prime ; sinon expiré si le code a dépassé sa validité. */
export function linkStatus(
  row: { profile_id: string | null; token_hash: string | null; expires_at: string },
  now: Date,
): LinkStatus {
  if (row.profile_id && row.token_hash) return 'approved';
  if (new Date(row.expires_at).getTime() < now.getTime()) return 'expired';
  return 'pending';
}
