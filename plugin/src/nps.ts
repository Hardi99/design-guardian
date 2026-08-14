// Logique de déclenchement du prompt NPS — pure, testable (comme clampView).
// L'état est persisté en clientStorage (main thread) ; cette fonction ne fait que décider.

export interface NpsState {
  done?: boolean;         // a déjà répondu → ne plus jamais afficher
  snoozeUntil?: number;   // ignoré → ne pas réafficher avant cette date (ms epoch)
}

export const NPS_THRESHOLD = 3;                        // afficher à la 3ᵉ capture réussie
export const NPS_SNOOZE_MS = 90 * 24 * 60 * 60 * 1000; // snooze 90 jours après un rejet

/** Décide si le prompt NPS doit s'afficher, au moment d'une capture réussie. */
export function shouldShowNps(
  state: NpsState, captureCount: number, now: number, threshold: number = NPS_THRESHOLD,
): boolean {
  if (state.done) return false;
  if (state.snoozeUntil != null && now < state.snoozeUntil) return false;
  return captureCount >= threshold;
}
