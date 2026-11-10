import { describe, it, expect } from 'vitest';
import { withPages } from '../services/asset-page.service.js';

const asset = (id: string) => ({ id, name: id });

describe('withPages — page Figma suivie par chaque historique', () => {
  it('page = nœud de la première capture (versions triées de la plus ancienne à la plus récente)', () => {
    const out = withPages([asset('a')], [
      { asset_id: 'a', figma_node_id: '0:1' },
      { asset_id: 'a', figma_node_id: '9:9' },
    ]);
    expect(out[0].page_id).toBe('0:1');
  });

  it('historique sans capture → null (réutilisable pour une autre page)', () => {
    expect(withPages([asset('vide')], [])[0].page_id).toBeNull();
  });

  it('captures sans identifiant de nœud (très anciennes) → "" : ni réutilisable, ni attribué', () => {
    expect(withPages([asset('vieux')], [{ asset_id: 'vieux', figma_node_id: null }])[0].page_id).toBe('');
  });

  it('chaque historique garde ses propres captures', () => {
    const out = withPages([asset('a'), asset('b')], [
      { asset_id: 'b', figma_node_id: '2:0' },
      { asset_id: 'a', figma_node_id: '0:1' },
    ]);
    expect(out.map(x => x.page_id)).toEqual(['0:1', '2:0']);
  });
});
