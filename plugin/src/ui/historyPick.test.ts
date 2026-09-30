import { describe, it, expect, vi } from 'vitest';
import { pickHistory, ensureHistory } from './historyPick.js';
import type { Asset } from '../store.js';

const a = (id: string): Asset => ({ id, name: id, asset_type: 'ui' });
const none = { currentId: null, lastId: null };

describe('pickHistory', () => {
  it('garde l\'historique ouvert s\'il existe toujours (réponse fraîche après le cache)', () => {
    expect(pickHistory([a('recent'), a('open')], { currentId: 'open', lastId: 'recent' })?.id).toBe('open');
  });
  it('sinon le dernier utilisé dans ce fichier', () => {
    expect(pickHistory([a('recent'), a('last')], { currentId: null, lastId: 'last' })?.id).toBe('last');
  });
  it('dernier utilisé supprimé ou déplacé → le plus récent (premier de la liste)', () => {
    expect(pickHistory([a('recent'), a('old')], { currentId: 'gone', lastId: 'gone-too' })?.id).toBe('recent');
  });
  it('aucun historique → null', () => {
    expect(pickHistory([], none)).toBeNull();
  });
});

describe('ensureHistory', () => {
  it('historique existant → aucune création', async () => {
    const create = vi.fn(async () => a('new'));
    expect((await ensureHistory([a('x')], none, create)).id).toBe('x');
    expect(create).not.toHaveBeenCalled();
  });
  it('liste vide → une seule création', async () => {
    const create = vi.fn(async () => a('new'));
    expect((await ensureHistory([], none, create)).id).toBe('new');
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('création en échec → l\'erreur remonte (l\'appelant affiche « Réessayer »)', async () => {
    await expect(ensureHistory([], none, async () => { throw new Error('réseau'); })).rejects.toThrow('réseau');
  });
});
