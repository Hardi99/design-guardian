'use client';

import { useEffect, useState } from 'react';
import { apiClient, type FontGlyph } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface FontSpecimenProps {
  versionId: string;
  fontName?: string;
}

// Map unicode to display character
function unicodeToChar(unicode: number): string {
  return String.fromCharCode(unicode);
}

export function FontSpecimen({ versionId, fontName }: FontSpecimenProps) {
  const [glyphs, setGlyphs] = useState<FontGlyph[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadGlyphs() {
      try {
        const data = await apiClient.getFontGlyphs(versionId);
        setGlyphs(data.glyphs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    }
    loadGlyphs();
  }, [versionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        {error}
      </div>
    );
  }

  // Group glyphs by category
  const uppercase = glyphs.filter(g => g.unicode >= 65 && g.unicode <= 90);
  const lowercase = glyphs.filter(g => g.unicode >= 97 && g.unicode <= 122);
  const numbers = glyphs.filter(g => g.unicode >= 48 && g.unicode <= 57);
  const symbols = glyphs.filter(g =>
    (g.unicode < 48) ||
    (g.unicode > 57 && g.unicode < 65) ||
    (g.unicode > 90 && g.unicode < 97) ||
    (g.unicode > 122)
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {fontName || 'Font Specimen'}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({glyphs.length} glyphes)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Uppercase */}
        {uppercase.length > 0 && (
          <GlyphGroup label="Majuscules" glyphs={uppercase} />
        )}

        {/* Lowercase */}
        {lowercase.length > 0 && (
          <GlyphGroup label="Minuscules" glyphs={lowercase} />
        )}

        {/* Numbers */}
        {numbers.length > 0 && (
          <GlyphGroup label="Chiffres" glyphs={numbers} />
        )}

        {/* Symbols */}
        {symbols.length > 0 && (
          <GlyphGroup label="Symboles" glyphs={symbols} />
        )}
      </CardContent>
    </Card>
  );
}

interface GlyphGroupProps {
  label: string;
  glyphs: FontGlyph[];
}

function GlyphGroup({ label, glyphs }: GlyphGroupProps) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </h4>
      <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-13 gap-1">
        {glyphs.map((glyph) => (
          <GlyphCell key={glyph.unicode} glyph={glyph} />
        ))}
      </div>
    </div>
  );
}

interface GlyphCellProps {
  glyph: FontGlyph;
}

function GlyphCell({ glyph }: GlyphCellProps) {
  const char = unicodeToChar(glyph.unicode);

  return (
    <div
      className="aspect-square border border-border rounded-md flex flex-col items-center justify-center p-1 hover:border-primary hover:bg-primary/5 transition-colors group"
      title={`${char} (U+${glyph.unicode.toString(16).toUpperCase().padStart(4, '0')})`}
    >
      <div
        className="w-full h-full flex items-center justify-center"
        dangerouslySetInnerHTML={{ __html: glyph.svg }}
      />
      <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
        {char}
      </span>
    </div>
  );
}
