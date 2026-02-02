import opentype from 'opentype.js';

export interface GlyphData {
  char: string;
  unicode: number;
  name: string;
  svg: string;
  width: number;
  height: number;
}

export interface FontData {
  name: string;
  family: string;
  style: string;
  unitsPerEm: number;
  glyphs: GlyphData[];
}

// Standard character set for comparison
const STANDARD_CHARS = [
  // Uppercase
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  // Lowercase
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  // Numbers
  ...'0123456789'.split(''),
  // Common punctuation
  ...'.,:;!?\'"-()[]{}@#$%&*+=/\\<>'.split(''),
];

export class FontParserService {
  /**
   * Parse a font file (OTF/TTF/WOFF) and extract glyphs as SVG
   */
  async parseFont(buffer: ArrayBuffer): Promise<FontData> {
    const font = opentype.parse(buffer);

    const fontData: FontData = {
      name: font.names.fullName?.en || font.names.fontFamily?.en || 'Unknown',
      family: font.names.fontFamily?.en || 'Unknown',
      style: font.names.fontSubfamily?.en || 'Regular',
      unitsPerEm: font.unitsPerEm,
      glyphs: [],
    };

    // Extract glyphs for standard characters
    for (const char of STANDARD_CHARS) {
      const glyph = font.charToGlyph(char);
      if (glyph && glyph.unicode) {
        const svg = this.glyphToSVG(glyph, font.unitsPerEm);
        fontData.glyphs.push({
          char,
          unicode: glyph.unicode,
          name: glyph.name || char,
          svg,
          width: glyph.advanceWidth || font.unitsPerEm,
          height: font.unitsPerEm,
        });
      }
    }

    return fontData;
  }

  /**
   * Convert a glyph to SVG string
   */
  private glyphToSVG(glyph: opentype.Glyph, unitsPerEm: number): string {
    const path = glyph.getPath(0, unitsPerEm, unitsPerEm);
    const pathData = path.toPathData(2);

    const width = glyph.advanceWidth || unitsPerEm;
    const height = unitsPerEm;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <path d="${pathData}" fill="currentColor"/>
</svg>`;
  }

  /**
   * Extract a specific character from font
   */
  async extractGlyph(buffer: ArrayBuffer, char: string): Promise<GlyphData | null> {
    const font = opentype.parse(buffer);
    const glyph = font.charToGlyph(char);

    if (!glyph || !glyph.unicode) return null;

    return {
      char,
      unicode: glyph.unicode,
      name: glyph.name || char,
      svg: this.glyphToSVG(glyph, font.unitsPerEm),
      width: glyph.advanceWidth || font.unitsPerEm,
      height: font.unitsPerEm,
    };
  }

  /**
   * Get font metadata without extracting all glyphs
   */
  async getFontInfo(buffer: ArrayBuffer): Promise<Omit<FontData, 'glyphs'> & { glyphCount: number }> {
    const font = opentype.parse(buffer);

    return {
      name: font.names.fullName?.en || font.names.fontFamily?.en || 'Unknown',
      family: font.names.fontFamily?.en || 'Unknown',
      style: font.names.fontSubfamily?.en || 'Regular',
      unitsPerEm: font.unitsPerEm,
      glyphCount: font.glyphs.length,
    };
  }
}

export const fontParserService = new FontParserService();
