import type { FujianApi } from '@shared/types'

declare global {
  interface Window {
    fujian: FujianApi
  }
}

export {}
