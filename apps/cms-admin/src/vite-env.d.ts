/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, for example `https://cms-api.example.com`. Empty in dev (uses the proxy). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The `package.json` version, injected by Vite `define`. */
declare const __APP_VERSION__: string;
