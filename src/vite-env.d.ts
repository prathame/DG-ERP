/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_MOBILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
