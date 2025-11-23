/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DOMAIN: string
  readonly SERVER_PORT: string
  readonly FRONTEND_PORT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}