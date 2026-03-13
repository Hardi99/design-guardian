import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient } from '../config/supabase.js';
import { getEnv } from '../config/env.js';
import { DiffService } from '../services/diff.service.js';
import { OpenAIService } from '../services/openai.service.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { createCheckpointSchema } from '../types/api.js';
import type { CheckpointResponse, ErrorResponse } from '../types/api.js';
import type { FigmaSnapshot } from '../types/figma.js';
import type { ProjectEnv } from '../types/hono.js';
import { generateSvgFromSnapshot } from '../services/svg-generator.service.js';

const checkpointsRouter = new Hono<ProjectEnv>();
const diffService = new DiffService();
let openai: OpenAIService;
const getOpenAI = () => (openai ??= new OpenAIService(getEnv().OPENAI_API_KEY));

checkpointsRouter.post('/', pluginMiddleware, zValidator('json', createCheckpointSchema), async (c) => {
  const supabase = getSupabaseClient();
  const projectId = c.get('projectId');
  const body = c.req.valid('json');

  // 1. Verify asset belongs to this project
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('id, project_id')
    .eq('id', body.asset_id)
    .eq('project_id', projectId)
    .single();

  if (assetError || !asset) return c.json<ErrorResponse>({ error: 'Asset not found' }, 404);

  // 2. Previous version on this branch (for diff)
  const { data: prev } = await supabase
    .from('versions')
    .select('id, version_number, snapshot_json')
    .eq('asset_id', body.asset_id)
    .eq('branch_name', body.branch_name)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = prev ? prev.version_number + 1 : 1;

  // 3. Diff + AI summary
  let analysisJson = null;
  let aiSummary = null;
  if (prev?.snapshot_json) {
    const delta = diffService.compareSnapshots(prev.snapshot_json as FigmaSnapshot, body.snapshot_json as FigmaSnapshot);
    analysisJson = delta;
    aiSummary = delta.totalChanges > 0
      ? await getOpenAI().generatePatchNote(delta, body.author.name)
      : 'Aucune modification détectée.';
  }

  // 4. Store SVG in Supabase Storage (display only, non-blocking)
  let storagePath: string | null = null;
  const svgBase64: string | null = body.svg_base64
    ? body.svg_base64
    : (() => {
        try {
          const svgString = generateSvgFromSnapshot(body.snapshot_json as FigmaSnapshot);
          return Buffer.from(svgString).toString('base64');
        } catch (err) {
          console.warn('[SVG fallback generation failed]', err);
          return null;
        }
      })();

  if (svgBase64) {
    const path = `${projectId}/${body.asset_id}/${body.branch_name}/v${nextVersion}.svg`;
    const { error } = await supabase.storage
      .from('design-guardian')
      .upload(path, Buffer.from(svgBase64, 'base64'), { contentType: 'image/svg+xml', upsert: true });
    if (error) console.error('[SVG upload error]', error.message);
    else storagePath = path;
  } else {
    console.warn('[SVG] no svg available for version', nextVersion);
  }

  // 5. Insert version
  const { data: version, error: versionError } = await supabase
    .from('versions')
    .insert({
      asset_id: body.asset_id,
      parent_id: prev?.id ?? null,
      branch_name: body.branch_name,
      version_number: nextVersion,
      author_figma_id: body.author.figma_id,
      author_name: body.author.name,
      author_avatar_url: body.author.avatar_url ?? null,
      figma_node_id: body.figma_node_id ?? null,
      snapshot_json: body.snapshot_json,
      storage_path: storagePath,
      analysis_json: analysisJson,
      ai_summary: aiSummary,
    })
    .select()
    .single();

  if (versionError || !version) {
    return c.json<ErrorResponse>({ error: 'Failed to save checkpoint', details: versionError?.message }, 500);
  }

  return c.json<CheckpointResponse>({ version, analysis: analysisJson, ai_summary: aiSummary }, 201);
});

export { checkpointsRouter };
