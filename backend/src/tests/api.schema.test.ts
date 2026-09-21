import { describe, it, expect } from 'vitest';
import { createAssetSchema } from '../types/api.js';

/**
 * Un champ absent du schéma Zod est supprimé SILENCIEUSEMENT du corps validé — c'est la
 * cause historique de plusieurs pertes de données dans ce projet. D'où un test qui vise
 * le schéma directement plutôt que la route.
 */
describe('createAssetSchema — scope', () => {
  it('conserve scope=page (sinon Zod le supprimerait en silence)', () => {
    const parsed = createAssetSchema.parse({ name: 'Écrans app', asset_type: 'ui', scope: 'page' });
    expect(parsed.scope).toBe('page');
  });

  it('scope absent reste accepté (la base applique le défaut frame)', () => {
    const parsed = createAssetSchema.parse({ name: 'Logo', asset_type: 'logo' });
    expect(parsed.scope).toBeUndefined();
  });

  it('rejette une valeur de scope inconnue', () => {
    expect(() => createAssetSchema.parse({ name: 'X', asset_type: 'ui', scope: 'calque' })).toThrow();
  });
});
