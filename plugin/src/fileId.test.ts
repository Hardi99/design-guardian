import { describe, it, expect } from 'vitest';
import { decideFileId, isValidFileId } from './fileId.js';

const HEX = 'a'.repeat(32);
const gen = () => 'b'.repeat(32);

// L'identifiant de fichier vit UNIQUEMENT dans le fichier (pluginData racine). Jamais dans
// figma.clientStorage : ce stockage est propre à l'utilisateur, commun à tous ses fichiers —
// un repli dessus faisait partager un même projet (et ses assets) à tous les fichiers ouverts.
describe('decideFileId', () => {
  it('id valide déjà dans le fichier → réutilisé, rien à écrire', () => {
    expect(decideFileId(HEX, gen)).toEqual({ fileId: HEX, mustWrite: false });
  });

  it('fichier sans id → nouvel id, à écrire dans le fichier', () => {
    expect(decideFileId('', gen)).toEqual({ fileId: 'b'.repeat(32), mustWrite: true });
  });

  it('id ancien au format refusé par le serveur (18 car., « 0:1 ») → remplacé', () => {
    expect(decideFileId('AbCdEfGhIjKlMnOpQr', gen)).toEqual({ fileId: 'b'.repeat(32), mustWrite: true });
    expect(decideFileId('0:1', gen)).toEqual({ fileId: 'b'.repeat(32), mustWrite: true });
  });
});

describe('isValidFileId', () => {
  it('32 hex minuscules uniquement', () => {
    expect(isValidFileId(HEX)).toBe(true);
    expect(isValidFileId('A'.repeat(32))).toBe(false);
    expect(isValidFileId('a'.repeat(31))).toBe(false);
  });
});
