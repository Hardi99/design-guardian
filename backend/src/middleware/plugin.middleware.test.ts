import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pluginMiddleware } from './plugin.middleware.js';

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('../config/supabase.js', () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(headers: Record<string, string | undefined> = {}) {
  const stored: Record<string, unknown> = {};
  return {
    req: { header: (name: string) => headers[name] },
    set: (key: string, value: unknown) => { stored[key] = value; },
    get: (key: string) => stored[key],
    json: (body: unknown, status = 200) => ({ body, status }),
    _stored: stored,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pluginMiddleware – missing header', () => {
  it('returns 401 when X-API-Key header is absent', async () => {
    const ctx = makeContext({});
    const next = vi.fn();
    const res = await pluginMiddleware(ctx as never, next);
    expect((res as { status: number }).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('pluginMiddleware – invalid key', () => {
  beforeEach(() => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('returns 401 when key not found in DB', async () => {
    const ctx = makeContext({ 'X-API-Key': 'bad-key' });
    const next = vi.fn();
    const res = await pluginMiddleware(ctx as never, next);
    expect((res as { status: number }).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('queries projects table with the provided key', async () => {
    const ctx = makeContext({ 'X-API-Key': 'test-abc' });
    await pluginMiddleware(ctx as never, vi.fn());
    expect(mockFrom).toHaveBeenCalledWith('projects');
    expect(mockEq).toHaveBeenCalledWith('api_key', 'test-abc');
  });
});

describe('pluginMiddleware – valid key', () => {
  beforeEach(() => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'proj-123' }, error: null });
  });

  it('calls next() when key is valid', async () => {
    const ctx = makeContext({ 'X-API-Key': 'valid-key' });
    const next = vi.fn().mockResolvedValue(undefined);
    await pluginMiddleware(ctx as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('sets projectId in context', async () => {
    const ctx = makeContext({ 'X-API-Key': 'valid-key' });
    const next = vi.fn().mockResolvedValue(undefined);
    await pluginMiddleware(ctx as never, next);
    expect(ctx._stored['projectId']).toBe('proj-123');
  });
});
