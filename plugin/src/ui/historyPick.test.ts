import { describe, it, expect, vi } from 'vitest';
import { pickHistory, ensureHistory } from './historyPick.js';
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
  it("historique trouvé → aucune création, et il est rattaché à la page", async () => {
    const create = vi.fn(async () => a('new', null));
    const got = await ensureHistory([a('vide', null)], on('5:0'), create);
    expect(got).toMatchObject({ id: 'vide', page_id: '5:0' });
    expect(create).not.toHaveBeenCalled();
  });
  it('aucun historique pour la page → une création, rattachée à la page', async () => {
    const create = vi.fn(async () => a('new', null));
    expect(await ensureHistory([a('p1', '0:1')], on('5:0'), create)).toMatchObject({ id: 'new', page_id: '5:0' });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("création en échec → l'erreur remonte (l'appelant affiche « Réessayer »)", async () => {
    await expect(ensureHistory([], on('0:1'), async () => { throw new Error('réseau'); })).rejects.toThrow('réseau');
  });
});
