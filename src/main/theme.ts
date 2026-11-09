import { nativeTheme, systemPreferences } from 'electron'
import type { ThemeInfo } from '../shared/types'

const FALLBACK_ACCENT = '#5b8def'
const DARK_TEXT = '#0a1424'
const LIGHT_TEXT = '#ffffff'

function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '')
  if (!/^[0-9a-f]{6,8}$/i.test(raw)) return null
  return `#${raw.slice(0, 6).toLowerCase()}`
}

export function readAccentColor(): string {
  try {
    const color = normalizeHex(systemPreferences.getAccentColor())
    return color ?? FALLBACK_ACCENT
  } catch {
    return FALLBACK_ACCENT
  }
}

function srgbChannel(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b)
}

export function contrastText(background: string): string {
  try {
    return relativeLuminance(background) > 0.35 ? DARK_TEXT : LIGHT_TEXT
  } catch {
    return LIGHT_TEXT
  }
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
  return { h, s: s * 100, l: l * 100 }
}

function hslToHex(h: number, s: number, l: number): string {
  const saturation = s / 100
  const lightness = l / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lightness - chroma / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [chroma, x, 0]
  else if (h < 120) [r, g, b] = [x, chroma, 0]
  else if (h < 180) [r, g, b] = [0, chroma, x]
  else if (h < 240) [r, g, b] = [0, x, chroma]
  else if (h < 300) [r, g, b] = [x, 0, chroma]
  else [r, g, b] = [chroma, 0, x]
  const channel = (value: number): string =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/**
 * The native accent is the user's system color. Keep its hue, but tune its
 * lightness for the effective appearance: deeper on light glass, lifted on
 * dark glass. This is the same idea as macOS systemBlue (#007AFF / #0A84FF).
 */
function accentForAppearance(base: string, dark: boolean): string {
  const { h, s, l } = hexToHsl(base)
  if (dark) {
    return hslToHex(h, Math.min(Math.max(s, 48), 88), Math.max(l, 68))
  }
  return hslToHex(h, Math.min(Math.max(s, 42), 86), Math.min(l, 47))
}

export function currentTheme(): ThemeInfo {
  const dark = nativeTheme.shouldUseDarkColors
  const accent = accentForAppearance(readAccentColor(), dark)
  return {
    dark,
    accent,
    onAccent: contrastText(accent)
  }
}
