import { describe, it, expect } from 'vitest';
import { latestPerAsset, planSplit } from '../services/split.service.js';

// Séparer un fichier d'un projet partagé : le plugin vérifie quels éléments suivis existent
// dans le fichier ouvert (id du nœud + dg_id de sa dernière capture), puis demande au serveur
// de les déplacer vers un NOUVEAU projet propre à ce fichier.

describe('latestPerAsset', () => {
  it('garde la dernière version de chaque asset (toutes branches confondues)', () => {
    const rows = [
      { asset_id: 'a', figma_node_id: '1:1', storage_path: 'a/main/v1.json', created_at: '2026-09-01T00:00:00Z' },
      { asset_id: 'a', figma_node_id: '1:9', storage_path: 'a/dev/v1.json',  created_at: '2026-09-03T00:00:00Z' },
      { asset_id: 'b', figma_node_id: '2:2', storage_path: 'b/main/v1.json', created_at: '2026-09-02T00:00:00Z' },
    ];
    const out = latestPerAsset(rows);
    expect(out.get('a')?.figma_node_id).toBe('1:9');
    expect(out.get('b')?.figma_node_id).toBe('2:2');
  });

  it('ignore les versions sans nœud Figma', () => {
    const out = latestPerAsset([{ asset_id: 'a', figma_node_id: null, storage_path: null, created_at: '2026-09-01T00:00:00Z' }]);
    expect(out.has('a')).toBe(false);
  });
});

describe('planSplit', () => {
  const owned = ['a', 'b', 'c'];

  it('déplace les assets demandés qui appartiennent au projet courant', () => {
    expect(planSplit({ requested: ['a', 'c'], owned, keyTaken: false }))
      .toEqual({ ok: true, move: ['a', 'c'] });
  });

  it('refuse un asset d\'un autre projet (on ne récupère pas les assets des autres)', () => {
    expect(planSplit({ requested: ['a', 'zzz'], owned, keyTaken: false }))
      .toEqual({ ok: false, status: 403, error: 'Some assets do not belong to this project' });
  });

  it('refuse un identifiant de fichier déjà utilisé (pas de prise de contrôle d\'un projet existant)', () => {
    expect(planSplit({ requested: ['a'], owned, keyTaken: true }))
      .toEqual({ ok: false, status: 409, error: 'This file id is already linked to a project' });
  });

  it('liste vide acceptée : le fichier repart avec un historique vierge', () => {
    expect(planSplit({ requested: [], owned, keyTaken: false })).toEqual({ ok: true, move: [] });
  });

  it('doublons dédupliqués', () => {
    expect(planSplit({ requested: ['a', 'a'], owned, keyTaken: false })).toEqual({ ok: true, move: ['a'] });
  });
});
