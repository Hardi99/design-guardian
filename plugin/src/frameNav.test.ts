import { describe, it, expect } from 'vitest';
import { frameHistory, frameStats, hasFrameNav, touchedFrames, restoreAllowedInDiff, cacheableDiff, defaultHomeTab, summaryCardLabel, sinceLastVisit } from './frameNav.js';
import type { Version } from './store.js';

const v = (id: string, at: string, frames?: Array<[string, 'initial' | 'modified' | 'unchanged']>): Version => ({
  id, version_number: 1, branch_name: 'main', parent_id: null, status: 'draft', ai_summary: null,
  created_at: at, author_name: null, author_avatar_url: null,
  ...(frames ? { frames: frames.map(([key, status]) => ({ key, id: key, name: key, frame: { w: 1, h: 1 }, status, changes: status === 'modified' ? 1 : 0 })) } : {}),
});

describe('frameHistory', () => {
  const versions = [
    v('v1', '2026-09-01', [['A', 'initial'], ['B', 'initial']]),
    v('v2', '2026-09-02', [['A', 'unchanged'], ['B', 'modified']]),
    v('v3', '2026-09-03', [['A', 'modified'], ['B', 'unchanged']]),
  ];

  it('ne garde que les versions où la frame est apparue ou a changé', () => {
    expect(frameHistory(versions, 'A').map(x => x.id)).toEqual(['v1', 'v3']);
    expect(frameHistory(versions, 'B').map(x => x.id)).toEqual(['v1', 'v2']);
  });

  it('frame inconnue → historique vide', () => {
    expect(frameHistory(versions, 'Z')).toEqual([]);
  });

  it('stats : nombre de versions et date du dernier changement', () => {
    expect(frameStats(versions, 'A')).toEqual({ versions: 2, lastAt: '2026-09-03' });
    expect(frameStats(versions, 'Z')).toEqual({ versions: 0, lastAt: null });
  });
});

describe('hasFrameNav', () => {
  it('vrai dès qu\'une version porte un résumé de frames ; faux pour un asset en mode frame', () => {
    expect(hasFrameNav([v('v1', '2026-09-01', [['A', 'initial']])])).toBe(true);
    expect(hasFrameNav([v('v1', '2026-09-01')])).toBe(false);
  });
});

// Onglet « Toutes les versions » : une version de page n'a plus de rendu global ; le diff
// propose les frames touchées (nouvelles ou modifiées) pour ouvrir leur diff.
describe('touchedFrames', () => {
  it('frames nouvelles ou modifiées, jamais inchangées ; vide sans résumé', () => {
    const fs = v('v1', '2026-09-01', [['A', 'modified'], ['B', 'unchanged'], ['C', 'initial']]).frames;
    expect(touchedFrames(fs).map(f => f.key)).toEqual(['A', 'C']);
    expect(touchedFrames(undefined)).toEqual([]);
    expect(touchedFrames(null)).toEqual([]);
  });
});

// Diff d'UNE frame : « Restore » réappliquerait toute la page (restauration par frame = Phase 4).
describe('restoreAllowedInDiff', () => {
  it('interdit quand une frame est sélectionnée, permis sinon', () => {
    expect(restoreAllowedInDiff({ key: 'A', name: 'Accueil' })).toBe(false);
    expect(restoreAllowedInDiff(null)).toBe(true);
  });
});

// Juste après une capture, les rendus de frame sont encore en cours d'envoi : une réponse sans
// rendu ne doit pas être mise en cache pour toute la session.
describe('cacheableDiff', () => {
  it('ne met en cache qu\'une réponse qui a un rendu', () => {
    expect(cacheableDiff({ render_url: 'https://x' })).toBe(true);
    expect(cacheableDiff({ render_url: null })).toBe(false);
  });
});

describe('defaultHomeTab', () => {
  it('historique récent (versions avec frames) → onglet Frames', () => {
    expect(defaultHomeTab([v('v1', '2026-09-01', [['A', 'initial']])])).toBe('frames');
  });
  it('historique ancien (aucune version avec frames) → Toutes les versions', () => {
    expect(defaultHomeTab([v('v1', '2026-09-01')])).toBe('versions');
  });
});

describe('summaryCardLabel', () => {
  it("annonce le résumé IA aux lecteurs d'écran", () => {
    expect(summaryCardLabel({ ...v('v3', '2026-09-01'), version_number: 3, ai_summary: 'Le bouton passe au vert.' }))
      .toBe('Dernier checkpoint, version 3 — Le bouton passe au vert.');
  });
  it('sans résumé → seulement la version', () => {
    expect(summaryCardLabel({ ...v('v3', '2026-09-01'), version_number: 3, ai_summary: null }))
      .toBe('Dernier checkpoint, version 3');
  });
});

describe('sinceLastVisit — « Depuis ta dernière visite »', () => {
  const at = (n: number, author: string, frames: Array<[string, 'initial' | 'modified' | 'unchanged']>) =>
    ({ ...v(`v${n}`, `2026-11-0${n}`, frames), version_number: n, author_name: author });
  const versions = [
    at(1, 'Léa', [['A', 'initial'], ['B', 'initial']]),
    at(2, 'Sam', [['A', 'modified'], ['B', 'unchanged']]),
    at(3, 'Léa', [['A', 'modified'], ['B', 'modified']]),
    at(4, 'Sam', [['A', 'unchanged'], ['B', 'modified']]),
  ];

  it('premier lancement (rien de vu) → pas de carte', () => {
    expect(sinceLastVisit(versions, null)).toBeNull();
  });
  it('une seule nouvelle version → pas de carte (le résumé IA habituel suffit)', () => {
    expect(sinceLastVisit(versions, 3)).toBeNull();
  });
  it('plusieurs nouvelles versions → de la dernière vue à la plus récente, frames touchées par leur dernier auteur', () => {
    const s = sinceLastVisit(versions, 1)!;
    expect([s.from.id, s.to.id, s.count]).toEqual(['v1', 'v4', 3]);
    expect(s.frames).toEqual([{ key: 'A', name: 'A', author: 'Léa' }, { key: 'B', name: 'B', author: 'Sam' }]);
  });
});
