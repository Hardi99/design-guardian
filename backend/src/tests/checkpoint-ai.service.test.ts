import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeltaJSON } from '../types/figma.js';

// ── mocks (vi.hoisted : disponibles dans les factories hoistées) ─────────────────
const { mockUpdateEq, mockUpdate, mockFrom, mockGenerate, mockInc, mockSendCheckpoint } = vi.hoisted(() => {
  const mockUpdateEq = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
  const mockFrom = vi.fn(() => ({ update: mockUpdate }));
  return {
    mockUpdateEq, mockUpdate, mockFrom,
    mockGenerate: vi.fn(async () => 'Résumé IA'),
    mockInc: vi.fn(),
    mockSendCheckpoint: vi.fn(async () => ({ sent: true })),
  };
});

vi.mock('../config/supabase.js', () => ({ getSupabaseClient: () => ({ from: mockFrom }) }));
vi.mock('../services/openai.service.js', () => ({
  OpenAIService: class { generatePatchNote = mockGenerate; },
}));
vi.mock('../services/metrics.service.js', () => ({ aiSummariesGeneratedTotal: { inc: mockInc } }));
vi.mock('../services/notification.service.js', () => ({ sendCheckpointNotification: mockSendCheckpoint }));
vi.mock('../config/env.js', () => ({ getEnv: () => ({ OPENAI_API_KEY: 'k' }) }));

import { generateAndStoreSummary } from '../services/checkpoint-ai.service.js';

const delta = { totalChanges: 3 } as unknown as DeltaJSON;

describe('generateAndStoreSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('génère, écrit ai_summary et incrémente la métrique success', async () => {
    const ok = await generateAndStoreSummary({
      versionId: 'v1', delta, authorName: 'Alice',
      branchName: 'main', versionNumber: 2, projectName: 'Logo',
    });
    expect(ok).toBe(true);
    expect(mockGenerate).toHaveBeenCalledWith(delta, 'Alice');
    expect(mockFrom).toHaveBeenCalledWith('versions');
    expect(mockUpdate).toHaveBeenCalledWith({ ai_summary: 'Résumé IA' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'v1');
    expect(mockInc).toHaveBeenCalledWith({ status: 'success' });
  });

  it('envoie l\'email checkpoint si notifyEmail fourni', async () => {
    await generateAndStoreSummary({
      versionId: 'v1', delta, authorName: 'Alice', notifyEmail: 'a@b.co',
      branchName: 'main', versionNumber: 2, projectName: 'Logo',
    });
    expect(mockSendCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
      to: 'a@b.co', aiSummary: 'Résumé IA', projectName: 'Logo', versionNumber: 2,
    }));
  });

  it('en cas d\'échec OpenAI : renvoie false, métrique error, pas de throw', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('boom'));
    const ok = await generateAndStoreSummary({
      versionId: 'v1', delta, authorName: 'Alice',
      branchName: 'main', versionNumber: 2, projectName: 'Logo',
    });
    expect(ok).toBe(false);
    expect(mockInc).toHaveBeenCalledWith({ status: 'error' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
