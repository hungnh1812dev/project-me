/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** cms-api base URL, e.g. `https://domain.com/api/v1`. See .env.example. */
  readonly VITE_API_BASE_URL?: string;
  /** Cloudflare Turnstile site key (public). See .env.example. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
