/**
 * Cloudflare Workers entry point
 * CF Workers bindings (secrets + vars) are NOT in process.env automatically —
 * they come via the fetch handler's `env` parameter and must be copied manually.
 */
import { createApp } from './app.js';

const app = createApp();

export default {
  fetch(request: Request, env: Record<string, string>, ctx: ExecutionContext) {
    // Expose CF Workers bindings as process.env so existing code works unchanged
    Object.assign(process.env, env);
    return app.fetch(request, env, ctx);
  },
};
