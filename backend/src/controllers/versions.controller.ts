import { Hono } from 'hono';
import { getSupabaseClient, getSupabaseStorage } from '../config/supabase.js';
import { getEnv } from '../config/env.js';
import { SVGParserService } from '../services/svg-parser.service.js';
import { SVGDiffService } from '../services/svg-diff.service.js';
import { OpenAIService } from '../services/openai.service.js';
import type {
  VersionResponse,
  VersionsListResponse,
  CompareVersionsResponse,
  ErrorResponse
} from '../types/api.js';

const versionsRouter = new Hono();

// Services instances
const svgParser = new SVGParserService();
const svgDiff = new SVGDiffService();
let openaiService: OpenAIService;

/**
 * GET /api/versions
 * List all versions for an asset
 */
versionsRouter.get('/', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { asset_id } = c.req.query();

    if (!asset_id) {
      return c.json<ErrorResponse>({ error: 'asset_id query parameter required' }, 400);
    }

    const { data, error } = await supabase
      .from('versions')
      .select('*')
      .eq('asset_id', asset_id)
      .order('version_number', { ascending: false });

    if (error) {
      return c.json<ErrorResponse>({ error: 'Failed to fetch versions', details: error.message }, 500);
    }

    return c.json<VersionsListResponse>({ versions: data });
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/versions/:id
 * Get a specific version
 */
versionsRouter.get('/:id', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { id } = c.req.param();

    const { data, error } = await supabase
      .from('versions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return c.json<ErrorResponse>({ error: 'Version not found' }, 404);
    }

    return c.json<VersionResponse>({
      version: data,
      analysis: data.analysis_json,
      ai_summary: data.ai_summary
    });
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/versions/upload
 * Upload a new version of an SVG file
 */
versionsRouter.post('/upload', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const storage = getSupabaseStorage();

    // Initialize OpenAI service
    if (!openaiService) {
      const env = getEnv();
      openaiService = new OpenAIService(env.OPENAI_API_KEY);
    }

    const body = await c.req.parseBody();
    const assetId = body['asset_id'] as string;
    const file = body['file'] as File;

    if (!assetId || !file) {
      return c.json<ErrorResponse>({ error: 'asset_id and file are required' }, 400);
    }

    // Verify asset exists
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (assetError || !asset) {
      return c.json<ErrorResponse>({ error: 'Asset not found' }, 404);
    }

    // Get next version number
    const { data: existingVersions } = await supabase
      .from('versions')
      .select('version_number')
      .eq('asset_id', assetId)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersion = existingVersions && existingVersions.length > 0
      ? existingVersions[0]!.version_number + 1
      : 1;

    // Read SVG content
    const svgContent = await file.text();

    // Upload to Supabase Storage
    const storagePath = `${asset.project_id}/${assetId}/v${nextVersion}.svg`;
    const { error: uploadError } = await storage
      .from('svg-files')
      .upload(storagePath, svgContent, {
        contentType: 'image/svg+xml',
        upsert: false
      });

    if (uploadError) {
      return c.json<ErrorResponse>({
        error: 'Failed to upload file',
        details: uploadError.message
      }, 500);
    }

    // Parse new version
    const parsedNew = await svgParser.parseSVG(svgContent);

    let analysisResult = null;
    let aiSummary = null;

    // If this is not the first version, compare with previous
    if (nextVersion > 1) {
      const { data: previousVersion } = await supabase
        .from('versions')
        .select('storage_path')
        .eq('asset_id', assetId)
        .eq('version_number', nextVersion - 1)
        .single();

      if (previousVersion) {
        // Download previous version
        const { data: prevFile } = await storage
          .from('svg-files')
          .download(previousVersion.storage_path);

        if (prevFile) {
          const prevContent = await prevFile.text();
          const parsedPrev = await svgParser.parseSVG(prevContent);

          // Run diff analysis
          analysisResult = await svgDiff.compareSVGs(parsedPrev, parsedNew);

          // Generate AI summary
          aiSummary = await openaiService.generateSummary(analysisResult);
        }
      }
    }

    // Save version to database
    const { data: newVersion, error: versionError } = await supabase
      .from('versions')
      .insert({
        asset_id: assetId,
        storage_path: storagePath,
        version_number: nextVersion,
        analysis_json: analysisResult,
        ai_summary: aiSummary
      })
      .select()
      .single();

    if (versionError || !newVersion) {
      return c.json<ErrorResponse>({
        error: 'Failed to create version',
        details: versionError?.message
      }, 500);
    }

    // Update asset's current_version_id
    await supabase
      .from('assets')
      .update({ current_version_id: newVersion.id })
      .eq('id', assetId);

    return c.json<VersionResponse>({
      version: newVersion,
      analysis: analysisResult,
      ai_summary: aiSummary
    }, 201);
  } catch (error) {
    console.error('Upload error:', error);
    return c.json<ErrorResponse>({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * GET /api/versions/compare/:v1Id/:v2Id
 * Compare two specific versions
 */
versionsRouter.get('/compare/:v1Id/:v2Id', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const storage = getSupabaseStorage();
    const { v1Id, v2Id } = c.req.param();

    // Initialize OpenAI service
    if (!openaiService) {
      const env = getEnv();
      openaiService = new OpenAIService(env.OPENAI_API_KEY);
    }

    // Fetch both versions
    const { data: v1, error: v1Error } = await supabase
      .from('versions')
      .select('*')
      .eq('id', v1Id)
      .single();

    const { data: v2, error: v2Error } = await supabase
      .from('versions')
      .select('*')
      .eq('id', v2Id)
      .single();

    if (v1Error || v2Error || !v1 || !v2) {
      return c.json<ErrorResponse>({ error: 'One or both versions not found' }, 404);
    }

    // Download both SVG files
    const { data: file1 } = await storage.from('svg-files').download(v1.storage_path);
    const { data: file2 } = await storage.from('svg-files').download(v2.storage_path);

    if (!file1 || !file2) {
      return c.json<ErrorResponse>({ error: 'Failed to download SVG files' }, 500);
    }

    const content1 = await file1.text();
    const content2 = await file2.text();

    // Parse both
    const parsed1 = await svgParser.parseSVG(content1);
    const parsed2 = await svgParser.parseSVG(content2);

    // Run diff
    const analysis = await svgDiff.compareSVGs(parsed1, parsed2);

    // Generate AI summary
    const aiSummary = await openaiService.generateSummary(analysis);

    return c.json({
      v1,
      v2,
      svg1: content1,
      svg2: content2,
      analysis,
      ai_summary: aiSummary
    });
  } catch (error) {
    console.error('Compare error:', error);
    return c.json<ErrorResponse>({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export { versionsRouter };
