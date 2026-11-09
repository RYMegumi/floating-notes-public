import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

const shared = resolve('src/shared')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        __FUJIAN_SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL ?? ''),
        __FUJIAN_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(
          env.SUPABASE_PUBLISHABLE_KEY ?? ''
        )
      },
      resolve: {
        alias: {
          '@shared': shared
        }
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: {
          '@shared': shared
        }
      }
    },
    renderer: {
      resolve: {
        alias: {
          '@shared': shared,
          '@renderer': resolve('src/renderer/src')
        }
      },
      plugins: [react()]
    }
  }
})
