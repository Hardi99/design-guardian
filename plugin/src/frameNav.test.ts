import { describe, it, expect } from 'vitest';
import { frameHistory, frameStats, hasFrameNav } from './frameNav.js';
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
