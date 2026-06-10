import { describe, it, expect, vi } from 'vitest';
import { pollPatchNote } from './patchNote.js';

describe('pollPatchNote', () => {
  it('renvoie le résumé dès qu\'il est disponible', async () => {
    const fetchVersion = vi.fn()
      .mockResolvedValueOnce({ ai_summary: null })
      .mockResolvedValueOnce({ ai_summary: 'Résumé prêt' });
    const result = await pollPatchNote(fetchVersion, { intervalMs: 0, maxTries: 5 });
    expect(result).toBe('Résumé prêt');
    expect(fetchVersion).toHaveBeenCalledTimes(2);
  });

  it('renvoie null après maxTries si jamais rempli (timeout)', async () => {
    const fetchVersion = vi.fn().mockResolvedValue({ ai_summary: null });
    const result = await pollPatchNote(fetchVersion, { intervalMs: 0, maxTries: 3 });
    expect(result).toBeNull();
    expect(fetchVersion).toHaveBeenCalledTimes(3);
  });

  it('ignore une erreur ponctuelle de fetch et continue', async () => {
    const fetchVersion = vi.fn()
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce({ ai_summary: 'OK' });
    const result = await pollPatchNote(fetchVersion, { intervalMs: 0, maxTries: 5 });
    expect(result).toBe('OK');
  });
});
