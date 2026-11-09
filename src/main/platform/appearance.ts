import os from 'node:os'
import type { BrowserWindowConstructorOptions } from 'electron'

export type WindowMaterial = 'acrylic' | 'vibrancy' | 'solid'

export function windowsBuildNumber(): number {
  const parts = os.release().split('.')
  const build = Number.parseInt(parts[2] ?? '', 10)
  return Number.isFinite(build) ? build : 0
}

export function supportsAcrylic(): boolean {
  return process.platform === 'win32' && windowsBuildNumber() >= 22621
}

export function supportsVibrancy(): boolean {
  return process.platform === 'darwin'
}

/**
 * macOS 26 (Tahoe) replaced the old NSVisualEffectView materials with Liquid
 * Glass. Electron's vibrancy API still reports an effect view on Tahoe but
 * renders it as flat grey, so the widget uses an NSGlassEffectView there.
 */
export function supportsLiquidGlass(): boolean {
  if (process.platform !== 'darwin') return false
  const major = Number.parseInt(process.getSystemVersion().split('.')[0] ?? '', 10)
  return Number.isFinite(major) && major >= 26
}

/**
 * The renderer only needs to know whether the window is truly opaque.
 * macOS vibrancy is closer to the acrylic "transparent surface" mode.
 */
export function preferredWindowMaterial(): WindowMaterial {
  if (supportsVibrancy()) return 'vibrancy'
  if (supportsAcrylic()) return 'acrylic'
  return 'solid'
}

export function windowAppearanceOptions(
  material: WindowMaterial
): Pick<
  BrowserWindowConstructorOptions,
  'transparent' | 'backgroundMaterial' | 'vibrancy' | 'visualEffectState' | 'hasShadow'
> {
  if (material === 'acrylic') {
    return {
      transparent: false,
      backgroundMaterial: 'acrylic',
      hasShadow: true
    }
  }

  if (material === 'vibrancy') {
    // On macOS 26 the native glass view is installed by glass.ts after the
    // window exists. Adding legacy vibrancy as well would put a grey layer
    // behind the glass, so it must be left out there.
    if (supportsLiquidGlass()) {
      return {
        transparent: true,
        hasShadow: true
      }
    }

    return {
      // Vibrancy is painted by AppKit behind the transparent web contents.
      transparent: true,
      vibrancy: 'under-window',
      // Keep the glass alive when the widget is not the key window, otherwise
      // it turns flat grey whenever the user works in another app.
      visualEffectState: 'active',
      hasShadow: true
    }
  }

  return {
    transparent: true,
    hasShadow: false
  }
}

/**
 * macOS uses a native title bar with the title and traffic lights hidden. This
 * keeps AppKit's rounded window mask, shadow and vibrancy while still looking
 * like a borderless desktop widget. Other platforms stay fully frameless.
 */
export function windowChromeOptions(): Pick<
  BrowserWindowConstructorOptions,
  'frame' | 'titleBarStyle' | 'acceptFirstMouse'
> {
  if (process.platform === 'darwin') {
    return {
      frame: true,
      titleBarStyle: 'hidden',
      // A desktop widget is usually not the key window. Let the first click
      // both activate the app and hit the task/button under the cursor.
      acceptFirstMouse: true
    }
  }

  return {
    frame: false
  }
}
