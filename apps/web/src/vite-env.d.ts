/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** cms-api base URL, e.g. `/api/v1`. See .env.example. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
