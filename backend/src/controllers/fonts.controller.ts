import { Hono } from 'hono';
import { getSupabaseClient } from '../config/supabase.js';
import { fontParserService } from '../services/font-parser.service.js';
import type { ErrorResponse } from '../types/api.js';

const fontsRouter = new Hono();

/**
 * POST /api/fonts/upload
 * Upload a font file and extract all glyphs
 */
fontsRouter.post('/upload', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const formData = await c.req.formData();

    const file = formData.get('file') as File | null;
    const assetId = formData.get('asset_id') as string | null;

    if (!file) {
      return c.json<ErrorResponse>({ error: 'No file provided' }, 400);
    }

    if (!assetId) {
      return c.json<ErrorResponse>({ error: 'asset_id is required' }, 400);
    }

    // Validate file type
    const validTypes = ['.otf', '.ttf', '.woff'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(ext)) {
      return c.json<ErrorResponse>({ error: 'Invalid file type. Supported: OTF, TTF, WOFF' }, 400);
    }

    // Parse font
    const buffer = await file.arrayBuffer();
    const fontData = await fontParserService.parseFont(buffer);

    // Store original font file in Supabase Storage
    const fontPath = `fonts/${assetId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(fontPath, buffer, {
        contentType: file.type || 'font/otf',
      });

    if (uploadError) {
      return c.json<ErrorResponse>({ error: 'Failed to upload font', details: uploadError.message }, 500);
    }

    // Get current max version number
    const { data: existingVersions } = await supabase
      .from('versions')
      .select('version_number')
      .eq('asset_id', assetId)
      .order('version_number', { ascending: false })
      .limit(1);

    const versionNumber = (existingVersions?.[0]?.version_number || 0) + 1;

    // Create version with font data
    const { data: version, error: versionError } = await supabase
      .from('versions')
      .insert({
        asset_id: assetId,
        storage_path: fontPath,
        version_number: versionNumber,
        analysis_json: {
          type: 'font',
          font_name: fontData.name,
          font_family: fontData.family,
          font_style: fontData.style,
          units_per_em: fontData.unitsPerEm,
          glyph_count: fontData.glyphs.length,
          glyphs: fontData.glyphs.map(g => ({
            char: g.char,
            unicode: g.unicode,
            name: g.name,
            width: g.width,
          })),
        },
      })
      .select()
      .single();

    if (versionError) {
      return c.json<ErrorResponse>({ error: 'Failed to create version', details: versionError.message }, 500);
    }

    // Store individual glyph SVGs
    const glyphPromises = fontData.glyphs.map(async (glyph) => {
      const glyphPath = `fonts/${assetId}/${version.id}/glyph_${glyph.unicode}.svg`;
      await supabase.storage.from('assets').upload(glyphPath, glyph.svg, {
        contentType: 'image/svg+xml',
      });
    });

    await Promise.all(glyphPromises);

    // Update asset's current_version_id
    await supabase
      .from('assets')
      .update({ current_version_id: version.id })
      .eq('id', assetId);

    return c.json({
      version,
      font: {
        name: fontData.name,
        family: fontData.family,
        style: fontData.style,
        glyphCount: fontData.glyphs.length,
      },
    }, 201);
  } catch (error) {
    console.error('Font upload error:', error);
    return c.json<ErrorResponse>({
      error: 'Failed to parse font',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/fonts/:versionId/glyphs
 * Get all glyphs for a font version
 */
fontsRouter.get('/:versionId/glyphs', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { versionId } = c.req.param();

    const { data: version, error } = await supabase
      .from('versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (error || !version) {
      return c.json<ErrorResponse>({ error: 'Version not found' }, 404);
    }

    const analysis = version.analysis_json as { type?: string; glyphs?: unknown[] } | null;
    if (analysis?.type !== 'font') {
      return c.json<ErrorResponse>({ error: 'Version is not a font' }, 400);
    }

    // Get glyph SVGs from storage
    const { data: files } = await supabase.storage
      .from('assets')
      .list(`fonts/${version.asset_id}/${versionId}`);

    const glyphs = await Promise.all(
      (files || [])
        .filter(f => f.name.startsWith('glyph_'))
        .map(async (f) => {
          const { data } = await supabase.storage
            .from('assets')
            .download(`fonts/${version.asset_id}/${versionId}/${f.name}`);

          const svg = data ? await data.text() : '';
          const unicode = parseInt(f.name.replace('glyph_', '').replace('.svg', ''), 10);

          return { unicode, svg };
        })
    );

    return c.json({
      version,
      glyphs: glyphs.sort((a, b) => a.unicode - b.unicode),
    });
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/fonts/compare/:v1Id/:v2Id
 * Compare two font versions glyph by glyph
 */
fontsRouter.get('/compare/:v1Id/:v2Id', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { v1Id, v2Id } = c.req.param();

    // Fetch both versions
    const [v1Result, v2Result] = await Promise.all([
      supabase.from('versions').select('*').eq('id', v1Id).single(),
      supabase.from('versions').select('*').eq('id', v2Id).single(),
    ]);

    if (!v1Result.data || !v2Result.data) {
      return c.json<ErrorResponse>({ error: 'Version not found' }, 404);
    }

    const v1Analysis = v1Result.data.analysis_json as { type?: string; glyphs?: { char: string; unicode: number }[] } | null;
    const v2Analysis = v2Result.data.analysis_json as { type?: string; glyphs?: { char: string; unicode: number }[] } | null;

    if (v1Analysis?.type !== 'font' || v2Analysis?.type !== 'font') {
      return c.json<ErrorResponse>({ error: 'Both versions must be fonts' }, 400);
    }

    // Compare glyph counts and characters
    const v1Chars = new Set(v1Analysis.glyphs?.map(g => g.char) || []);
    const v2Chars = new Set(v2Analysis.glyphs?.map(g => g.char) || []);

    const added = [...v2Chars].filter(c => !v1Chars.has(c));
    const removed = [...v1Chars].filter(c => !v2Chars.has(c));
    const common = [...v1Chars].filter(c => v2Chars.has(c));

    return c.json({
      v1: v1Result.data,
      v2: v2Result.data,
      comparison: {
        v1_glyph_count: v1Chars.size,
        v2_glyph_count: v2Chars.size,
        added_chars: added,
        removed_chars: removed,
        common_chars: common,
        summary: `${added.length} ajouté(s), ${removed.length} supprimé(s), ${common.length} en commun`,
      },
    });
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/fonts/info
 * Get font metadata without full parsing (quick check)
 */
fontsRouter.post('/info', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return c.json<ErrorResponse>({ error: 'No file provided' }, 400);
    }

    const buffer = await file.arrayBuffer();
    const info = await fontParserService.getFontInfo(buffer);

    return c.json({ info });
  } catch (error) {
    return c.json<ErrorResponse>({
      error: 'Failed to parse font',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export { fontsRouter };
