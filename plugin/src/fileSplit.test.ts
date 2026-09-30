import { describe, it, expect } from 'vitest';
import { classifyPresence, type AssetIdentity } from './fileSplit.js';

// Tri des éléments suivis d'un projet partagé entre plusieurs fichiers : un élément est
// « ici » si son nœud existe dans le fichier ouvert ET porte le même dg_id. Les id de nœuds
// sont propres à chaque fichier : un id court (« 126:4 ») peut exister par hasard ailleurs.

const id = (asset_id: string, figma_node_id: string, dg_id: string | null): AssetIdentity => ({ asset_id, figma_node_id, dg_id });

describe('classifyPresence', () => {
  it('nœud trouvé avec le même dg_id → ici', () => {
    const found = new Map([['17305:2208', 'DG-G']]);
    expect(classifyPresence([id('g', '17305:2208', 'DG-G')], found)).toEqual({ here: ['g'], elsewhere: [] });
  });

  it('nœud introuvable → ailleurs', () => {
    expect(classifyPresence([id('t', '116:21', 'DG-T')], new Map())).toEqual({ here: [], elsewhere: ['t'] });
  });

  it('même id de nœud mais autre dg_id (collision entre fichiers) → ailleurs', () => {
    const found = new Map([['126:4', 'DG-AUTRE']]);
    expect(classifyPresence([id('x', '126:4', 'DG-X')], found)).toEqual({ here: [], elsewhere: ['x'] });
  });

  it('capture ancienne sans dg_id : le nœud trouvé suffit', () => {
    const found = new Map([['1601:8', '']]);
    expect(classifyPresence([id('old', '1601:8', null)], found)).toEqual({ here: ['old'], elsewhere: [] });
  });

  // Restauration / branche : le nœud est remplacé par une copie au NOUVEL id Figma, qui
  // garde son dg_id. L'ancien id ne donne rien, mais le dg_id est présent dans le fichier.
  it('id de nœud introuvable mais dg_id présent dans le fichier (nœud restauré) → ici', () => {
    expect(classifyPresence([id('dg4', '17173:10110', 'DG-BRIEF')], new Map(), new Set(['DG-BRIEF'])))
      .toEqual({ here: ['dg4'], elsewhere: [] });
  });

  it('dg_id absent du fichier et nœud introuvable → ailleurs', () => {
    expect(classifyPresence([id('x', '1:1', 'DG-X')], new Map(), new Set(['DG-AUTRE'])))
      .toEqual({ here: [], elsewhere: ['x'] });
  });

  it('capture ancienne sans dg_id et nœud introuvable → ailleurs (rien pour le retrouver)', () => {
    expect(classifyPresence([id('old', '126:4', null)], new Map(), new Set(['DG-AUTRE'])))
      .toEqual({ here: [], elsewhere: ['old'] });
  });

  it('mélange : trie chaque élément', () => {
    const found = new Map([['17305:2208', 'DG-G'], ['126:4', 'DG-AUTRE']]);
    const out = classifyPresence([id('g', '17305:2208', 'DG-G'), id('t', '116:21', 'DG-T'), id('x', '126:4', 'DG-X')], found);
    expect(out).toEqual({ here: ['g'], elsewhere: ['t', 'x'] });
  });
});
