// UserEnv   — Supabase JWT auth (web app: /api/projects)
// ProjectEnv — API key auth   (plugin:   /api/assets, /api/checkpoints, /api/branches)
export type UserEnv    = { Variables: { userId: string } };
export type ProjectEnv = { Variables: { projectId: string } };

// Legacy alias for projects.controller.ts
export type AppEnv = UserEnv;
