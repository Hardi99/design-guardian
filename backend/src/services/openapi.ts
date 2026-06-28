export function getOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Design Guardian API',
      version: '1.0.0',
      description: 'Semantic vector versioning API for Figma design teams. Tracks geometric changes (position, size, fills, strokes, typography) at 0.01px precision and generates AI patch notes.',
      contact: { email: 'harditabuna@gmail.com' },
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'https://design-guardian-api.railway.app', description: 'Production (Railway)' },
      { url: 'http://localhost:3000', description: 'Local development' },
    ],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Project API key — auto-generated on first use via /api/projects/auto-init',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string', example: 'Asset not found' },
            details: { type: 'string', example: 'PGRST116' },
          },
        },
        Author: {
          type: 'object',
          required: ['figma_id', 'name'],
          properties: {
            figma_id: { type: 'string', example: '123456:789' },
            name: { type: 'string', example: 'Alice Dupont' },
            avatar_url: { type: 'string', format: 'uri', nullable: true },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            plan: { type: 'string', enum: ['free', 'pro', 'studio'], default: 'free' },
            api_key: { type: 'string' },
            figma_file_key: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Asset: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            project_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            figma_node_id: { type: 'string' },
            description: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Version: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            asset_id: { type: 'string', format: 'uuid' },
            parent_id: { type: 'string', format: 'uuid', nullable: true },
            branch_name: { type: 'string', example: 'main' },
            version_number: { type: 'integer', example: 3 },
            status: { type: 'string', enum: ['draft', 'review', 'approved'] },
            ai_summary: { type: 'string', nullable: true },
            author_name: { type: 'string' },
            author_figma_id: { type: 'string' },
            author_avatar_url: { type: 'string', nullable: true },
            figma_node_id: { type: 'string', nullable: true },
            storage_path: { type: 'string', nullable: true },
            approved_at: { type: 'string', format: 'date-time', nullable: true },
            approved_by: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        NodeChange: {
          type: 'object',
          properties: {
            prop: { type: 'string', example: 'fills' },
            before: {},
            after: {},
          },
        },
        NodeDiff: {
          type: 'object',
          properties: {
            nodeId: { type: 'string' },
            nodeName: { type: 'string' },
            nodeType: { type: 'string' },
            kind: { type: 'string', enum: ['modified', 'added', 'removed'] },
            significance: { type: 'string', enum: ['notable', 'minor'], description: "'notable' = authored ; 'minor' = dérivé (move porté par le parent / reflow auto-layout)" },
            changes: { type: 'array', items: { $ref: '#/components/schemas/NodeChange' } },
            before_bbox: { type: 'object', nullable: true, description: 'Bounding box of node before change (relative to frame)', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } },
            after_bbox: { type: 'object', nullable: true, description: 'Bounding box of node after change (relative to frame)', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } },
          },
        },
      },
    },
    tags: [
      { name: 'System', description: 'Health, metrics, diagnostics' },
      { name: 'Projects', description: 'Project management (one project = one Figma file)' },
      { name: 'Assets', description: 'Tracked design assets within a project' },
      { name: 'Checkpoints', description: 'Create new version checkpoints from the Figma plugin' },
      { name: 'Versions', description: 'Browse, compare, restore design versions' },
      { name: 'Auth', description: 'API key verification' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Health check',
          security: [],
          responses: {
            '200': {
              description: 'Service is running',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      version: { type: 'string', example: '1.0.0' },
                      uptime_ms: { type: 'integer' },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/ping': {
        get: {
          tags: ['System'],
          summary: 'Database ping (keeps Supabase free tier alive)',
          security: [],
          responses: {
            '200': { description: 'DB reachable', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } } } } },
            '503': { description: 'DB error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/metrics': {
        get: {
          tags: ['System'],
          summary: 'Prometheus metrics',
          description: 'Scraped by Prometheus every 15s. Exposes: http_requests_total, http_request_duration_ms, checkpoints_created_total, ai_summaries_generated_total, active_connections, plus Node.js default metrics.',
          security: [],
          responses: {
            '200': { description: 'Prometheus text format', content: { 'text/plain; version=0.0.4': { schema: { type: 'string' } } } },
          },
        },
      },
      '/api/auth/verify': {
        get: {
          tags: ['Auth'],
          summary: 'Verify API key',
          description: 'Validates the X-API-Key header and returns the associated project. Called by the plugin setup screen.',
          responses: {
            '200': {
              description: 'Valid key',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      project: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          plan: { type: 'string', enum: ['free', 'pro', 'studio'] },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Missing or invalid key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/projects/auto-init': {
        post: {
          tags: ['Projects'],
          summary: 'Auto-initialize project for a Figma file',
          description: 'Called automatically on plugin load. Creates a new project if the figma_file_key is unknown, or returns the existing API key.',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['figma_file_key', 'figma_file_name'],
                  properties: {
                    figma_file_key: { type: 'string', example: 'abc123xyz' },
                    figma_file_name: { type: 'string', example: 'Brand Redesign 2025' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Existing project found', content: { 'application/json': { schema: { type: 'object', properties: { api_key: { type: 'string' }, project: { $ref: '#/components/schemas/Project' } } } } } },
            '201': { description: 'New project created', content: { 'application/json': { schema: { type: 'object', properties: { api_key: { type: 'string' }, project: { $ref: '#/components/schemas/Project' } } } } } },
            '500': { description: 'Database error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/projects': {
        get: {
          tags: ['Projects'],
          summary: 'List all projects for the authenticated user',
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { projects: { type: 'array', items: { $ref: '#/components/schemas/Project' } } } } } } },
          },
        },
        post: {
          tags: ['Projects'],
          summary: 'Create a new project',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', example: 'My Design System' },
                    description: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { project: { $ref: '#/components/schemas/Project' } } } } } },
          },
        },
      },
      '/api/assets': {
        get: {
          tags: ['Assets'],
          summary: 'List assets in the current project',
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { assets: { type: 'array', items: { $ref: '#/components/schemas/Asset' } } } } } } },
          },
        },
        post: {
          tags: ['Assets'],
          summary: 'Register a new tracked asset',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'figma_node_id'],
                  properties: {
                    name: { type: 'string', example: 'Button / Primary' },
                    figma_node_id: { type: 'string', example: '24:56' },
                    description: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { asset: { $ref: '#/components/schemas/Asset' } } } } } },
          },
        },
      },
      '/api/checkpoints': {
        post: {
          tags: ['Checkpoints'],
          summary: 'Create a new design checkpoint',
          description: 'Called by the Figma plugin when the user clicks "Save checkpoint". Uploads the snapshot to Supabase Storage, diffs against the previous version, and generates an AI patch note via GPT-4o-mini.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['asset_id', 'branch_name', 'snapshot_json', 'author'],
                  properties: {
                    asset_id: { type: 'string', format: 'uuid' },
                    branch_name: { type: 'string', example: 'main' },
                    figma_node_id: { type: 'string', example: '24:56' },
                    snapshot_json: { type: 'object', description: 'Full FigmaSnapshot — root NodeSnapshot tree with all geometric properties' },
                    render_svg_b64: { type: 'string', description: 'Base64 SVG from exportAsync — pixel-perfect render for visual diff' },
                    author: { $ref: '#/components/schemas/Author' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Checkpoint created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      version: { $ref: '#/components/schemas/Version' },
                      analysis: { type: 'object', nullable: true, description: 'Delta JSON with modified/added/removed nodes' },
                      ai_summary: { type: 'string', nullable: true, description: 'GPT-4o-mini generated patch note' },
                    },
                  },
                },
              },
            },
            '404': { description: 'Asset not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '500': { description: 'Storage or database error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/checkpoints/{id}': {
        get: {
          tags: ['Checkpoints'],
          summary: 'Get a single checkpoint (AI patch-note polling)',
          description: 'The AI patch note is generated asynchronously after a checkpoint is created. The plugin polls this endpoint until ai_summary is filled.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Version',
              content: { 'application/json': { schema: { type: 'object', properties: { version: { $ref: '#/components/schemas/Version' } } } } },
            },
            '404': { description: 'Checkpoint not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/checkpoints/{id}/regenerate': {
        post: {
          tags: ['Checkpoints'],
          summary: 'Regenerate the AI patch note',
          description: 'Fallback when the async generation failed. Re-runs GPT-4o-mini on the already-stored analysis_json (no re-diff).',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Updated version',
              content: { 'application/json': { schema: { type: 'object', properties: { version: { $ref: '#/components/schemas/Version' } } } } },
            },
            '400': { description: 'Nothing to regenerate', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '404': { description: 'Checkpoint not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/branches/tree': {
        get: {
          tags: ['Versions'],
          summary: 'Get all versions for an asset (branch tree)',
          parameters: [
            { name: 'asset_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      versions: { type: 'array', items: { $ref: '#/components/schemas/Version' } },
                      branches: { type: 'array', items: { type: 'string' }, example: ['main', 'feat/dark-mode'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/branches/versions/{id}': {
        get: {
          tags: ['Versions'],
          summary: 'Get full version detail with visual diff',
          description: 'Returns version metadata, AI summary, per-node diffs (with frame-relative bbox for CSS cropping), and signed render URLs for the frame (current + previous).',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      version: { $ref: '#/components/schemas/Version' },
                      prev_version: { $ref: '#/components/schemas/Version' },
                      render_url: { type: 'string', nullable: true, description: 'Signed URL of the current frame render blob (PNG or SVG, TTL 3600s)' },
                      render_kind: { type: 'string', nullable: true, description: 'MIME kind of render_url: "png" or "svg"' },
                      prev_render_url: { type: 'string', nullable: true, description: 'Signed URL of the previous frame render blob' },
                      prev_render_kind: { type: 'string', nullable: true, description: 'MIME kind of prev_render_url: "png" or "svg"' },
                      render_source: { type: 'string', nullable: true, description: "Origine du rendu courant : 'blob' | 'legacy' | 'reconstruction'" },
                      prev_render_source: { type: 'string', nullable: true, description: 'Origine du rendu précédent' },
                      current_frame: { type: 'object', nullable: true, description: 'Dimensions de la frame courante (pour le crop CSS par-nœud)', properties: { w: { type: 'number' }, h: { type: 'number' } } },
                      prev_frame: { type: 'object', nullable: true, description: 'Dimensions de la frame précédente', properties: { w: { type: 'number' }, h: { type: 'number' } } },
                      node_diffs: { type: 'array', items: { $ref: '#/components/schemas/NodeDiff' } },
                    },
                  },
                },
              },
            },
            '404': { description: 'Version not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/branches/versions/{id}/snapshot': {
        get: {
          tags: ['Versions'],
          summary: 'Get raw snapshot JSON (for Apply to Figma)',
          description: 'Used by the plugin to fetch the full NodeSnapshot tree before applying it back to the Figma canvas.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { snapshot: { type: 'object', description: 'FigmaSnapshot' } } } } } },
            '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/branches/versions/{id}/restore': {
        post: {
          tags: ['Versions'],
          summary: 'Restore an older version as a new checkpoint',
          description: 'Creates a new version on the target branch whose snapshot is identical to the source version. Copies the pixel-perfect render if available.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['branch_name', 'author'],
                  properties: {
                    branch_name: { type: 'string', example: 'main' },
                    author: { $ref: '#/components/schemas/Author' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Restore checkpoint created', content: { 'application/json': { schema: { type: 'object', properties: { version: { $ref: '#/components/schemas/Version' } } } } } },
            '404': { description: 'Source version or snapshot not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/branches/versions/{id}/status': {
        put: {
          tags: ['Versions'],
          summary: 'Update version status',
          description: 'Transitions a version between draft → review → approved. Setting approved records the approver and timestamp.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['draft', 'review', 'approved'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Updated', content: { 'application/json': { schema: { type: 'object', properties: { version: { $ref: '#/components/schemas/Version' } } } } } },
            '400': { description: 'Invalid status', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
    },
  };
}
