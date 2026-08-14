import { describe, it, expect } from 'vitest';
import { shouldShowNps, NPS_THRESHOLD, NPS_SNOOZE_MS } from './nps.js';

const NOW = 1_000_000_000_000;

describe('shouldShowNps', () => {
  it('false sous le seuil', () => {
    expect(shouldShowNps({}, NPS_THRESHOLD - 1, NOW)).toBe(false);
  });
  it('true au seuil', () => {
    expect(shouldShowNps({}, NPS_THRESHOLD, NOW)).toBe(true);
  });
  it('true au-dessus du seuil', () => {
    expect(shouldShowNps({}, NPS_THRESHOLD + 5, NOW)).toBe(true);
  });
  it('false si déjà répondu (done)', () => {
    expect(shouldShowNps({ done: true }, 99, NOW)).toBe(false);
  });
  it('false si snooze encore actif', () => {
    expect(shouldShowNps({ snoozeUntil: NOW + NPS_SNOOZE_MS }, 99, NOW)).toBe(false);
  });
  it('true si snooze expiré', () => {
    expect(shouldShowNps({ snoozeUntil: NOW - 1 }, NPS_THRESHOLD, NOW)).toBe(true);
  });
});
