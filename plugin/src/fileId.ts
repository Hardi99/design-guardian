// Identifiant de fichier : relie un fichier Figma à SON projet (et donc à ses assets).
// Il vit UNIQUEMENT dans le fichier (pluginData racine) : il voyage avec lui et vaut pour
// tous ses éditeurs. Jamais dans figma.clientStorage, propre à l'utilisateur et commun à
// tous ses fichiers — un repli dessus faisait partager un même projet à tous ses fichiers.
// Jamais figma.fileKey : c'est la clé de l'URL (lisible dans tout lien de partage), or cet
// identifiant donne la clé d'API du projet. Logique pure, testable sans Figma.

export const FILE_ID_KEY = 'dg_file_id';

/** Format accepté par le serveur (auto-init) : 32 hex, imprévisible. */
export function isValidFileId(id: string): boolean {
  return /^[0-9a-f]{32}$/.test(id);
}

/** Id aléatoire de 128 bits (crypto si disponible dans le sandbox Figma). */
export function generateFileId(): string {
  const bytes = new Uint8Array(16);
  try { crypto.getRandomValues(bytes); } catch {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Id présent et valide → réutilisé. Absent, ou ancien format que le serveur refuse
 * (anciennes versions du plugin) → nouvel id, à écrire dans le fichier.
 */
export function decideFileId(stored: string, generate: () => string = generateFileId): { fileId: string; mustWrite: boolean } {
  if (isValidFileId(stored)) return { fileId: stored, mustWrite: false };
  return { fileId: generate(), mustWrite: true };
}
