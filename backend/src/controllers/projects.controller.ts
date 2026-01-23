import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient } from '../config/supabase.js';
import { createProjectSchema } from '../types/api.js';
import type { ProjectResponse, ProjectsListResponse, ErrorResponse } from '../types/api.js';

const projectsRouter = new Hono();

/**
 * GET /api/projects
 * List all projects for a user
 */
projectsRouter.get('/', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { owner_id } = c.req.query();

    if (!owner_id) {
      return c.json<ErrorResponse>({ error: 'owner_id query parameter required' }, 400);
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('owner_id', owner_id)
      .order('created_at', { ascending: false });

    if (error) {
      return c.json<ErrorResponse>({ error: 'Failed to fetch projects', details: error.message }, 500);
    }

    return c.json<ProjectsListResponse>({ projects: data });
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/projects/:id
 * Get a specific project
 */
projectsRouter.get('/:id', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { id } = c.req.param();

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return c.json<ErrorResponse>({ error: 'Project not found' }, 404);
    }

    return c.json<ProjectResponse>({ project: data });
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
projectsRouter.post('/', zValidator('json', createProjectSchema), async (c) => {
  try {
    const supabase = getSupabaseClient();
    const body = c.req.valid('json');

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: body.name,
        owner_id: body.owner_id
      })
      .select()
      .single();

    if (error || !data) {
      return c.json<ErrorResponse>({ error: 'Failed to create project', details: error?.message }, 500);
    }

    return c.json<ProjectResponse>({ project: data }, 201);
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
projectsRouter.delete('/:id', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { id } = c.req.param();

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) {
      return c.json<ErrorResponse>({ error: 'Failed to delete project', details: error.message }, 500);
    }

    return c.json({ message: 'Project deleted successfully' });
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

export { projectsRouter };
