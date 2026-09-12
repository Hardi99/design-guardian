import { describe, it, expect } from 'vitest';
import { extractSummary } from './realtime.js';

describe('extractSummary', () => {
  it('extrait le résumé de notre broadcast summary', () => {
    const raw = JSON.stringify({ event: 'broadcast', topic: 'realtime:checkpoint:v1', payload: { event: 'summary', payload: { ai_summary: 'Bouton déplacé de 4px.' } } });
    expect(extractSummary(raw)).toBe('Bouton déplacé de 4px.');
  });

  it('ignore le phx_reply du join', () => {
    const raw = JSON.stringify({ event: 'phx_reply', ref: '1', payload: { status: 'ok', response: {} }, topic: 'realtime:checkpoint:v1' });
    expect(extractSummary(raw)).toBeNull();
  });

  it('ignore un broadcast d\'un autre event', () => {
    const raw = JSON.stringify({ event: 'broadcast', payload: { event: 'ping', payload: { t: 1 } } });
    expect(extractSummary(raw)).toBeNull();
  });

  it('ignore un ai_summary vide ou absent', () => {
    expect(extractSummary(JSON.stringify({ event: 'broadcast', payload: { event: 'summary', payload: { ai_summary: '' } } }))).toBeNull();
    expect(extractSummary(JSON.stringify({ event: 'broadcast', payload: { event: 'summary', payload: {} } }))).toBeNull();
  });

  it('ignore un message non-JSON', () => {
    expect(extractSummary('not json')).toBeNull();
  });
});
