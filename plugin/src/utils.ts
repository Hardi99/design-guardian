/**
 * Décode une chaîne base64 en texte UTF-8. Décodage UTF-8 MANUEL (octets → code
 * points) car le sandbox Figma ne garantit pas `TextDecoder`. `atob` seul renvoie
 * du Latin-1 et corromprait les caractères multioctets (accents, €, …) — c'est W3.
 */
export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64)
  let out = ''
  let i = 0
  while (i < bin.length) {
    const c = bin.charCodeAt(i++)
    if (c < 0x80) {
      out += String.fromCharCode(c)
    } else if (c >= 0xc0 && c < 0xe0) {
      const c2 = bin.charCodeAt(i++)
      out += String.fromCharCode(((c & 0x1f) << 6) | (c2 & 0x3f))
    } else if (c >= 0xe0 && c < 0xf0) {
      const c2 = bin.charCodeAt(i++), c3 = bin.charCodeAt(i++)
      out += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f))
    } else {
      // 4 octets → paire de substitution (surrogate pair)
      const c2 = bin.charCodeAt(i++), c3 = bin.charCodeAt(i++), c4 = bin.charCodeAt(i++)
      const cp = (((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f)) - 0x10000
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
    }
  }
  return out
}

export function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'à l\'instant'
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  return h < 24 ? `il y a ${h}h` : `il y a ${Math.floor(h / 24)}j`
}
