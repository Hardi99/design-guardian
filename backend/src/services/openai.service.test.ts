import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeltaJSON } from '../types/figma.js';

// ─── Mock OpenAI (module-level mockCreate so tests can control it) ────────────

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    constructor(_opts: unknown) {}
  },
}));

// Import AFTER mock is registered
const { OpenAIService } = await import('./openai.service.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDelta(overrides: Partial<DeltaJSON> = {}): DeltaJSON {
  return {
    modified: [],
    added: [],
    removed: [],
    totalChanges: 0,
    metadata: {
      epsilon: 0.01,
      processingTimeMs: 5,
      v1CapturedAt: '2024-01-01T00:00:00Z',
      v2CapturedAt: '2024-01-02T00:00:00Z',
    },
    ...overrides,
  };
}

function makeModifiedNode(name = 'Button', changes = [{ property: 'width', oldValue: 100, newValue: 200, delta: '+100.00px' }]) {
  return { nodeId: 'n1', nodeName: name, nodeType: 'RECTANGLE', changes };
}

// ─── Zero changes ─────────────────────────────────────────────────────────────

describe('OpenAIService – zero changes', () => {
  it('returns no-change message without calling OpenAI', async () => {
    const svc = new OpenAIService('test-key');
    const result = await svc.generatePatchNote(makeDelta({ totalChanges: 0 }), 'Alice');
    expect(result).toBe('Aucune modification détectée. Les éléments sont identiques.');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ─── Fallback on error ────────────────────────────────────────────────────────

describe('OpenAIService – fallback on error', () => {
  beforeEach(() => {
    mockCreate.mockRejectedValue(new Error('Network error'));
  });

  it('returns fallback string on OpenAI error', async () => {
    const svc = new OpenAIService('test-key');
    const delta = makeDelta({
      totalChanges: 2,
      modified: [makeModifiedNode()],
      added: [makeModifiedNode('Icon')],
    });
    const result = await svc.generatePatchNote(delta, 'Bob');
    expect(result).toContain('@Bob');
    expect(result).toContain('modifié');
    expect(result).toContain('ajouté');
  });

  it('fallback with only removed nodes', async () => {
    const svc = new OpenAIService('test-key');
    const delta = makeDelta({ totalChanges: 1, removed: [makeModifiedNode('OldButton')] });
    const result = await svc.generatePatchNote(delta, 'Marie');
    expect(result).toContain('@Marie');
    expect(result).toContain('supprimé');
  });

  it('fallback starts with @authorName', async () => {
    const svc = new OpenAIService('test-key');
    const delta = makeDelta({ totalChanges: 1, modified: [makeModifiedNode()] });
    const result = await svc.generatePatchNote(delta, 'Jean-Paul');
    expect(result).toMatch(/^@Jean-Paul/);
  });
});

// ─── Successful response ──────────────────────────────────────────────────────

describe('OpenAIService – successful response', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '@Alice a modifié 1 propriété(s) :\n- width : 100 -> 200' } }],
    });
  });

  it('returns the AI-generated patch note', async () => {
    const svc = new OpenAIService('test-key');
    const delta = makeDelta({ totalChanges: 1, modified: [makeModifiedNode()] });
    const result = await svc.generatePatchNote(delta, 'Alice');
    expect(result).toContain('@Alice');
    expect(result).toContain('width');
  });

  it('trims whitespace from response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '  @Alice a modifié…  ' } }],
    });
    const svc = new OpenAIService('test-key');
    const delta = makeDelta({ totalChanges: 1, modified: [makeModifiedNode()] });
    const result = await svc.generatePatchNote(delta, 'Alice');
    expect(result).toBe('@Alice a modifié…');
  });

  it('falls back when choices array is empty', async () => {
    mockCreate.mockResolvedValue({ choices: [] });
    const svc = new OpenAIService('test-key');
    const delta = makeDelta({ totalChanges: 1, modified: [makeModifiedNode()] });
    const result = await svc.generatePatchNote(delta, 'Alice');
    expect(result).toContain('@Alice');
  });
});

// ─── Prompt structure ─────────────────────────────────────────────────────────

describe('OpenAIService – prompt content', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
  });

  it('prompt includes author name and total changes', async () => {
    mockCreate.mockClear();
    const svc = new OpenAIService('test-key');
    const delta = makeDelta({ totalChanges: 3, modified: [makeModifiedNode('Header')] });
    await svc.generatePatchNote(delta, 'Thomas');

    const callArgs = mockCreate.mock.lastCall![0];
    const userMsg = (callArgs.messages as Array<{ role: string; content: string }>).find(m => m.role === 'user')!.content;
    expect(userMsg).toContain('Thomas');
    expect(userMsg).toContain('3');
    expect(userMsg).toContain('Header');
  });

  it('uses temperature 0.2, max_tokens 250, model gpt-4o-mini', async () => {
    mockCreate.mockClear();
    const svc = new OpenAIService('test-key');
    await svc.generatePatchNote(makeDelta({ totalChanges: 1, modified: [makeModifiedNode()] }), 'X');
    const callArgs = mockCreate.mock.lastCall![0];
    expect(callArgs.temperature).toBe(0.2);
    expect(callArgs.max_tokens).toBe(250);
    expect(callArgs.model).toBe('gpt-4o-mini');
  });

  it('system prompt is in French and design-oriented', async () => {
    mockCreate.mockClear();
    const svc = new OpenAIService('test-key');
    await svc.generatePatchNote(makeDelta({ totalChanges: 1, modified: [makeModifiedNode()] }), 'X');
    const callArgs = mockCreate.mock.lastCall![0];
    const sysMsg = (callArgs.messages as Array<{ role: string; content: string }>).find(m => m.role === 'system')!.content;
    expect(sysMsg).toContain('Figma');
    expect(sysMsg).toContain('français');
  });
});
