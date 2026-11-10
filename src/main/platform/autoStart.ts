import { app, shell } from 'electron'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export type AutoStartWarning = (message: string) => void

export function autoStartSupported(): boolean {
  return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin')
}

function autoStartExecutable(): string {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
}

function startMenuStartupDirectory(): string {
  const override = process.env.FUJIAN_STARTUP_DIR?.trim()
  if (override) return resolve(override)
  return join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup'
  )
}

function autoStartShortcutPath(): string {
  return join(startMenuStartupDirectory(), '浮笺.lnk')
}

function sameWindowsPath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase()
}

function readWindowsAutoStart(): boolean {
  const shortcutPath = autoStartShortcutPath()
  if (!existsSync(shortcutPath)) return false
  try {
    const link = shell.readShortcutLink(shortcutPath)
    return sameWindowsPath(link.target, autoStartExecutable())
  } catch {
    return false
  }
}

function applyWindowsAutoStart(enabled: boolean, description: string): boolean {
  const shortcutPath = autoStartShortcutPath()
  if (!enabled) {
    if (existsSync(shortcutPath)) unlinkSync(shortcutPath)
    return readWindowsAutoStart()
  }

  const executable = autoStartExecutable()
  mkdirSync(dirname(shortcutPath), { recursive: true })
  const created = shell.writeShortcutLink(shortcutPath, 'create', {
    target: executable,
    cwd: dirname(executable),
    description,
    icon: executable,
    iconIndex: 0,
    appUserModelId: 'com.fujian.widget'
  })
  if (!created) throw new Error('未能创建 Windows 启动快捷方式。')
  return readWindowsAutoStart()
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function readAutoStart(): boolean {
  if (!autoStartSupported()) return false
  if (process.platform === 'darwin') {
    try {
      return app.getLoginItemSettings().openAtLogin
    } catch {
      return false
    }
  }
  return readWindowsAutoStart()
}

export function applyAutoStart(
  enabled: boolean,
  onWarning?: AutoStartWarning,
  description = '浮笺 · 桌面任务'
): boolean {
  if (!autoStartSupported()) return false

  try {
    if (process.platform === 'darwin') {
      app.setLoginItemSettings({ openAtLogin: enabled })
      return readAutoStart()
    }
    return applyWindowsAutoStart(enabled, description)
  } catch (error) {
    onWarning?.(`设置开机自启失败：${messageOf(error)}`)
    return readAutoStart()
  }
}
