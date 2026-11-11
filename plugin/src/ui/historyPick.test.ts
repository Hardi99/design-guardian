import { describe, it, expect, vi } from 'vitest';
import { pickHistory, ensureHistory, claimForPage, pageOptions } from './historyPick.js';
import type { Asset } from '../store.js';

const a = (id: string, page_id: string | null, scope: 'page' | 'frame' = 'page'): Asset =>
  ({ id, name: id, asset_type: 'ui', page_id, scope });
const on = (pageId: string, currentId: string | null = null) => ({ pageId, currentId });

describe('pickHistory — un historique par page', () => {
  it("ouvre l'historique de la page courante, pas celui d'une autre page", () => {
    expect(pickHistory([a('p1', '0:1'), a('p2', '5:0')], on('5:0'))?.id).toBe('p2');
  });
  it("garde l'historique ouvert s'il suit bien cette page", () => {
    expect(pickHistory([a('recent', '0:1'), a('open', '0:1')], on('0:1', 'open'))?.id).toBe('open');
  });
  it("l'historique ouvert d'une AUTRE page n'est pas gardé (sinon capture refusée)", () => {
    expect(pickHistory([a('autre', '0:1')], on('5:0', 'autre'))).toBeNull();
  });
  it('page sans historique → réutilise un historique encore vide', () => {
    expect(pickHistory([a('p1', '0:1'), a('vide', null)], on('5:0'))?.id).toBe('vide');
  });
  it("n'emprunte ni un ancien historique par frame, ni un historique aux captures sans page", () => {
    expect(pickHistory([a('frame', null, 'frame'), a('inconnu', '')], on('5:0'))).toBeNull();
  });
});

describe('pickHistory — serveur pas encore à jour (aucune page renvoyée)', () => {
  const old = (id: string): Asset => ({ id, name: id, asset_type: 'ui' });
  it("garde l'historique ouvert, sinon le plus récent — jamais de création en boucle", () => {
    expect(pickHistory([old('recent'), old('open')], on('5:0', 'open'))?.id).toBe('open');
    expect(pickHistory([old('recent'), old('x')], on('5:0'))?.id).toBe('recent');
  });
});

describe('ensureHistory', () => {
  it("historique vide trouvé → aucune création, et il reste libre tant qu'on n'a rien capturé", async () => {
    const create = vi.fn(async () => a('new', null));
    const got = await ensureHistory([a('vide', null)], on('5:0'), create);
    expect(got).toMatchObject({ id: 'vide', page_id: null });
    expect(create).not.toHaveBeenCalled();
  });
  it('aucun historique pour la page → une création, encore libre (réutilisée par la page suivante)', async () => {
    const create = vi.fn(async () => ({ id: 'new', name: 'new', asset_type: 'ui' }));
    expect(await ensureHistory([a('p1', '0:1')], on('5:0'), create)).toMatchObject({ id: 'new', page_id: null });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("création en échec → l'erreur remonte (l'appelant affiche « Réessayer »)", async () => {
    await expect(ensureHistory([], on('0:1'), async () => { throw new Error('réseau'); })).rejects.toThrow('réseau');
  });
});

describe('claimForPage — la première capture rattache l’historique à la page', () => {
  it('rattache et compte la nouvelle version, sans toucher aux autres historiques', () => {
    const got = claimForPage([{ ...a('vide', null), version_count: 0 }, a('autre', '0:1')], 'vide', '5:0');
    expect(got).toEqual([{ ...a('vide', '5:0'), version_count: 1 }, a('autre', '0:1')]);
  });
});

describe('pageOptions — libellés du sélecteur de page', () => {
  it('nombre de versions pour les pages qui ont un historique, rien pour les autres', () => {
    const assets = [{ ...a('h1', '0:1'), version_count: 3 }, { ...a('h2', '0:1'), version_count: 1 }, { ...a('vide', null), version_count: 0 }];
    expect(pageOptions([{ id: '0:1', name: 'Accueil' }, { id: '5:0', name: 'Panier' }], assets)).toEqual([
      { id: '0:1', label: 'Accueil · 4 versions' },
      { id: '5:0', label: 'Panier' },
    ]);
  });
  it('accorde au singulier', () => {
    expect(pageOptions([{ id: '0:1', name: 'A' }], [{ ...a('h', '0:1'), version_count: 1 }])[0].label).toBe('A · 1 version');
  });
});
