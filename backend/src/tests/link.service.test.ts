import { describe, it, expect } from 'vitest';
import { newCode, newToken, hashToken, linkStatus } from '../services/link.service.js';

describe('link.service', () => {
  it('newCode = 32 hex chars', () => {
    expect(newCode()).toMatch(/^[0-9a-f]{32}$/);
  });
  it('newToken: token 64 hex + hash = sha256(token)', () => {
    const { token, hash } = newToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken(token));
  });
  it('linkStatus: approved quand profile_id + token_hash', () => {
    const r = { profile_id: 'p', token_hash: 'h', expires_at: new Date(Date.now() - 1000).toISOString() };
    expect(linkStatus(r, new Date())).toBe('approved');
  });
  it('linkStatus: expired quand non approuvé et code expiré', () => {
    const r = { profile_id: null, token_hash: null, expires_at: new Date(Date.now() - 1000).toISOString() };
    expect(linkStatus(r, new Date())).toBe('expired');
  });
  it('linkStatus: pending sinon', () => {
    const r = { profile_id: null, token_hash: null, expires_at: new Date(Date.now() + 60000).toISOString() };
    expect(linkStatus(r, new Date())).toBe('pending');
  });
});
