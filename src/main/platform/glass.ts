import type { BrowserWindow } from 'electron'
import { supportsLiquidGlass } from './appearance'

interface LiquidGlassOptions {
  cornerRadius?: number
  tintColor?: string
  opaque?: boolean
}

interface LiquidGlassModule {
  addView(handle: Buffer, options?: LiquidGlassOptions): number
}

let cachedAddon: LiquidGlassModule | null | undefined

/**
 * electron-liquid-glass is an optional dependency because it is macOS-only.
 * Load it lazily so Windows/Linux builds never touch a native module, and so a
 * missing or incompatible optional binary can fall back gracefully.
 */
function loadAddon(): LiquidGlassModule | null {
  if (cachedAddon !== undefined) return cachedAddon
  try {
    const moduleName = 'electron-liquid-glass'
    const loaded = require(moduleName) as Partial<LiquidGlassModule>
    cachedAddon = typeof loaded.addView === 'function' ? (loaded as LiquidGlassModule) : null
  } catch (error) {
    console.warn('[fujian] liquid glass addon unavailable:', error)
    cachedAddon = null
  }
  return cachedAddon
}

/**
 * Puts a native NSGlassEffectView behind the transparent web contents. This is
 * the macOS 26+ counterpart of Windows Acrylic; the renderer only paints
 * translucent tints on top.
 */
export function applyLiquidGlass(window: BrowserWindow): boolean {
  if (!supportsLiquidGlass()) return false
  const addon = loadAddon()
  if (!addon) return false

  try {
    const id = addon.addView(window.getNativeWindowHandle(), {
      cornerRadius: 20,
      tintColor: '#00000000',
      opaque: false
    })
    return id >= 0
  } catch (error) {
    console.warn('[fujian] failed to install liquid glass:', error)
    return false
  }
}
