/// <reference types="vite/client" />

import type { CobraaAPI } from './src/lib/ipc'

declare global {
  interface Window {
    api: CobraaAPI
  }
}

export {}

