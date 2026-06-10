export interface PollOptions { intervalMs: number; maxTries: number }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Interroge `fetchVersion` jusqu'à obtenir un ai_summary non vide, ou jusqu'à maxTries.
 * Best-effort : une erreur de fetch est ignorée (on retente). Renvoie le résumé, ou null si timeout.
 */
export async function pollPatchNote(
  fetchVersion: () => Promise<{ ai_summary: string | null }>,
  { intervalMs, maxTries }: PollOptions,
): Promise<string | null> {
  for (let i = 0; i < maxTries; i++) {
    try {
      const v = await fetchVersion();
      if (v.ai_summary) return v.ai_summary;
    } catch {
      /* retry */
    }
    if (i < maxTries - 1) await sleep(intervalMs);
  }
  return null;
}
