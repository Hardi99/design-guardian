/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_API_BASE?: string; // ex. http://localhost:3001 (autorisé par devAllowedDomains)
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
