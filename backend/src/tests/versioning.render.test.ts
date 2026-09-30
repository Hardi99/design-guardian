import { describe, it, expect, vi } from 'vitest';
import { renderPathFor, uploadRender } from '../services/versioning.service.js';

describe('renderPathFor', () => {
  it('dérive le path du rendu depuis le storage_path du snapshot', () => {
    expect(renderPathFor('a1/main/v2.json', 'png')).toBe('a1/main/v2_render.png');
    expect(renderPathFor('a1/main/v2.json', 'svg')).toBe('a1/main/v2_render.svg');
  });
});

describe('uploadRender', () => {
  it('upload le rendu au path dérivé avec le bon content-type (upsert)', async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const storage = { from: () => ({ upload }) } as never;

    await uploadRender(storage, 'a1/main/v3.json', Buffer.from('<svg/>').toString('base64'), 'svg');

    expect(upload).toHaveBeenCalledTimes(1);
    const [path, , opts] = upload.mock.calls[0] as [string, unknown, { contentType: string; upsert: boolean }];
    expect(path).toBe('a1/main/v3_render.svg');
    expect(opts).toMatchObject({ contentType: 'image/svg+xml', upsert: true });
  });
});

describe('rendus par frame (page-centric)', () => {
  it('chemin de rendu par frame (clé nettoyée) ; sans clé, chemin historique inchangé', () => {
    expect(renderPathFor('a/main/v3.json', 'png', 'DG-1:2')).toBe('a/main/v3_render_DG-1_2.png');
    expect(renderPathFor('a/main/v3.json', 'png')).toBe('a/main/v3_render.png');
  });

  it('uploadRender range le rendu d\'une frame sous sa clé', async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const storage = { from: () => ({ upload }) } as never;
    await uploadRender(storage, 'a/main/v3.json', Buffer.from('x').toString('base64'), 'png', 'DG-A');
    expect((upload.mock.calls[0] as unknown as [string])[0]).toBe('a/main/v3_render_DG-A.png');
  });
});
