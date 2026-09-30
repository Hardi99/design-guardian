import { describe, it, expect } from 'vitest';
import { createAssetSchema, createCheckpointSchema, uploadRenderSchema } from '../types/api.js';

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

describe('createCheckpointSchema — layoutMode', () => {
  const node = (extra: Record<string, unknown>) => ({
    id: 'n', name: 'n', type: 'FRAME', x: 0, y: 0, width: 1, height: 1, opacity: 1, fills: [], strokes: [], ...extra,
  });
  const body = (root: Record<string, unknown>) => ({
    asset_id: '00000000-0000-4000-8000-000000000000', branch_name: 'main',
    author: { figma_id: 'u', name: 'U' },
    snapshot_json: { figmaNodeId: 'n', figmaNodeName: 'n', capturedAt: '2026-09-30T00:00:00Z', root },
  });

  it('conserve layoutMode à la racine et dans les enfants (sinon Zod le supprime en silence)', () => {
    const parsed = createCheckpointSchema.parse(body(node({ layoutMode: 'VERTICAL', children: [node({ layoutMode: 'NONE' })] })));
    const root = parsed.snapshot_json.root as { layoutMode?: string; children: Array<{ layoutMode?: string }> };
    expect(root.layoutMode).toBe('VERTICAL');
    expect(root.children[0].layoutMode).toBe('NONE');
  });
});

describe('createCheckpointSchema — floating', () => {
  it('conserve floating (sinon Zod le supprime en silence)', () => {
    const node = { id: 'n', name: 'n', type: 'GROUP', x: 0, y: 0, width: 1, height: 1, opacity: 1, fills: [], strokes: [] };
    const parsed = createCheckpointSchema.parse({
      asset_id: '00000000-0000-4000-8000-000000000000', branch_name: 'main', author: { figma_id: 'u', name: 'U' },
      snapshot_json: { figmaNodeId: 'n', figmaNodeName: 'n', capturedAt: '2026-09-30T00:00:00Z',
        root: { ...node, type: 'PAGE', children: [{ ...node, floating: true }] } },
    });
    expect((parsed.snapshot_json.root as { children: Array<{ floating?: boolean }> }).children[0].floating).toBe(true);
  });
});

describe('uploadRenderSchema — frame_key', () => {
  it('conserve frame_key et refuse une clé exotique (chemin de stockage)', () => {
    expect(uploadRenderSchema.parse({ render_svg_b64: 'x', render_kind: 'png', frame_key: 'DG-A' }).frame_key).toBe('DG-A');
    expect(() => uploadRenderSchema.parse({ render_svg_b64: 'x', frame_key: '../../etc' })).toThrow();
  });
});
