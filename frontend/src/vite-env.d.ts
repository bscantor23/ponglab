/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOMAIN: string
  readonly VITE_SERVER_PORT: string
  readonly VITE_FRONTEND_PORT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}