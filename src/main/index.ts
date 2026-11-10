import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  session,
  shell,
  systemPreferences,
  Tray
} from 'electron'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  isLanguage,
  isLanguagePreference,
  resolveLanguage,
  translate,
  type Language
} from '../shared/i18n'
import { AccountService } from './account'
import { LlmService } from './llm'
import {
  applyAutoStart,
  applyLiquidGlass,
  autoStartSupported,
  installApplicationMenu,
  preferredWindowMaterial,
  readAutoStart,
  supportsLiquidGlass,
  windowAppearanceOptions,
  windowChromeOptions,
  type WindowMaterial
} from './platform'
import { LocalStore, sanitizeSettings } from './store'
import { currentTheme } from './theme'
import type {
  AccountActionResult,
  AppSettings,
  BootstrapData,
  BulkKeywordsResult,
  Note,
  NoteKeywordsResult,
  SaveNotesResult,
  SaveTasksResult,
  SettingsChangedPayload,
  SettingsResult,
  Task,
  ThemeInfo
} from '../shared/types'

const WIDGET_WIDTH = 408
// Keep this below the height of a single-task layout, otherwise the leftover
// window area shows through as an unpainted strip below the app surface.
const WIDGET_MIN_HEIGHT = 80
const WIDGET_MAX_HEIGHT = 860
const SCREEN_MARGIN = 14
const DEFAULT_EDGE_MARGIN = 30

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let trayMenu: Menu | null = null
let store: LocalStore
let accountService: AccountService
let llmService: LlmService
let tasks: Task[] = []
let notes: Note[] = []
let settings: AppSettings
let language: Language = 'zh-CN'
let loadWarnings: string[] = []
let runtimeWarnings: string[] = []
let quitting = false
let hasShownWindow = false
let material: WindowMaterial = preferredWindowMaterial()
let materialSupported = material !== 'solid'
let positionSaveTimer: NodeJS.Timeout | null = null
let lastAppliedHeight = 0
let lastThemeKey = ''
const hiddenTestMode = process.env.FUJIAN_TEST_HIDDEN === '1'
const forcedLanguage = process.env.FUJIAN_LANGUAGE?.trim()

app.setName('浮笺')
app.setAppUserModelId('com.fujian.widget')

const customDataDir = process.env.FUJIAN_DATA_DIR?.trim()
const dataDir = customDataDir
  ? resolve(customDataDir)
  : join(app.getPath('appData'), 'Fujian')
app.setPath('userData', dataDir)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow(true)
  })

  void app.whenReady().then(startApp)
}

async function startApp(): Promise<void> {
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: app.name,
      applicationVersion: app.getVersion(),
      copyright: 'Copyright © 2026 Fujian'
    })
    // The Windows build deliberately stays out of the taskbar. The Dock is
    // macOS' equivalent, so the widget lives in the menu bar instead.
    app.dock?.hide()
  }
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler(() => false)

  store = new LocalStore(dataDir)
  const loaded = store.load()
  tasks = loaded.tasks
  notes = loaded.notes
  settings = loaded.settings
  language = isLanguage(forcedLanguage)
    ? forcedLanguage
    : resolveLanguage(settings.language, app.getLocale())
  loadWarnings = store.loadWarnings.map(translateWarning)
  llmService = new LlmService(dataDir, () => language)
  nativeTheme.themeSource = settings.theme
  installApplicationMenu(menuActions(), language)

  accountService = new AccountService({
    dataDir,
    getLanguage: () => language,
    getTasks: () => tasks,
    setTasks: (next) => {
      tasks = next
      try {
        store.saveTasks(next)
      } catch (error) {
        addWarning(t('云端任务写入本地失败：{message}', { message: messageOf(error) }))
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tasks:changed', next)
      }
    },
    getNotes: () => notes,
    setNotes: (next) => {
      notes = next
      try {
        store.saveNotes(next)
      } catch (error) {
        addWarning(t('云端随记写入本地失败：{message}', { message: messageOf(error) }))
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('notes:changed', next)
      }
    },
    onStateChanged: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('account:changed', state)
      }
    }
  })
  await accountService.initialize()

  if (autoStartSupported()) {
    const actual = readAutoStart()
    if (actual !== settings.launchAtLogin) {
      settings = { ...settings, launchAtLogin: actual }
      try {
        store.saveSettings(settings)
      } catch (error) {
        addWarning(t('开机自启状态同步失败：{message}', { message: messageOf(error) }))
      }
    }
  }

  registerIpc()
  createMainWindow()
  if (!hiddenTestMode) createTray()

  nativeTheme.on('updated', () => {
    broadcastTheme()
    refreshTrayMenu()
  })

  if (process.platform === 'win32') {
    systemPreferences.on('accent-color-changed', () => {
      broadcastTheme(true)
    })
    systemPreferences.on('color-changed', () => {
      broadcastTheme(true)
      refreshTrayMenu()
    })
  }

  screen.on('display-removed', keepWindowOnScreen)
  screen.on('display-added', keepWindowOnScreen)
  screen.on('display-metrics-changed', keepWindowOnScreen)
}

function t(key: string, params?: Record<string, string | number>): string {
  return translate(language, key, params)
}

function translateWarning(warning: string): string {
  const taskSkipped = warning.match(
    /^有 (\d+) 条任务数据无法读取，已跳过；原始文件仍保留在备份目录。$/
  )
  if (taskSkipped) {
    return t('有 {count} 条任务数据无法读取，已跳过；原始文件仍保留在备份目录。', {
      count: taskSkipped[1] ?? ''
    })
  }
  const noteSkipped = warning.match(
    /^有 (\d+) 条随记数据无法读取，已跳过；原始文件仍保留在备份目录。$/
  )
  if (noteSkipped) {
    return t('有 {count} 条随记数据无法读取，已跳过；原始文件仍保留在备份目录。', {
      count: noteSkipped[1] ?? ''
    })
  }
  return t(warning)
}

function menuActions() {
  return {
    openApp: () => showWindow(true),
    openSettings: () => {
      showWindow(true)
      sendToRenderer('ui:open-settings')
    },
    createTask: () => {
      showWindow(true)
      sendToRenderer('ui:new-task')
    },
    createNote: () => {
      showWindow(true)
      sendToRenderer('ui:new-note')
    }
  }
}

function resolveInitialPosition(): { x: number; y: number } {
  const saved = settings.windowPosition
  if (saved && positionIsVisible(saved.x, saved.y, WIDGET_WIDTH, 520)) {
    return saved
  }

  const workArea = screen.getPrimaryDisplay().workArea
  return {
    x: workArea.x + workArea.width - WIDGET_WIDTH - DEFAULT_EDGE_MARGIN,
    y: workArea.y + DEFAULT_EDGE_MARGIN
  }
}

function positionIsVisible(x: number, y: number, width: number, height: number): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const overlapX = Math.min(x + width, area.x + area.width) - Math.max(x, area.x)
    const overlapY = Math.min(y + height, area.y + area.height) - Math.max(y, area.y)
    return overlapX >= 70 && overlapY >= 50
  })
}

function createMainWindow(): void {
  const position = resolveInitialPosition()
  const iconPath = resourcePath('app-icon.png')
  const commonOptions: Electron.BrowserWindowConstructorOptions = {
    width: WIDGET_WIDTH,
    height: 520,
    x: position.x,
    y: position.y,
    useContentSize: true,
    show: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    roundedCorners: true,
    backgroundColor: '#00000000',
    title: '浮笺',
    autoHideMenuBar: true,
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: !hiddenTestMode,
      devTools: !app.isPackaged
    }
  }

  try {
    mainWindow = new BrowserWindow({
      ...commonOptions,
      ...windowChromeOptions(),
      ...windowAppearanceOptions(material)
    })
  } catch (error) {
    addWarning(
      t('系统透明/毛玻璃效果不可用，已切换到纯色外观：{message}', {
        message: messageOf(error)
      })
    )
    materialSupported = false
    material = 'solid'
    mainWindow = new BrowserWindow({
      ...commonOptions,
      ...windowChromeOptions(),
      ...windowAppearanceOptions('solid')
    })
  }

  const window = mainWindow
  if (process.platform === 'darwin') {
    // Keep the native rounded corner/shadow/vibrancy mask, but remove the
    // traffic lights so the surface reads as a widget, not a document window.
    window.setWindowButtonVisibility(false)
    if (supportsLiquidGlass() && !applyLiquidGlass(window)) {
      addWarning(t('系统玻璃效果加载失败，已退回旧版半透明材质。'))
      window.setVibrancy('under-window')
    }
  }
  window.setMenuBarVisibility(false)
  window.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined)

  if (settings.alwaysOnTop) {
    window.setAlwaysOnTop(true, 'floating')
  }

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
  window.webContents.on('context-menu', (event) => {
    event.preventDefault()
  })

  window.once('ready-to-show', () => {
    setTimeout(() => {
      if (!hasShownWindow) maybeShowWindow()
    }, 600)
  })

  window.on('move', schedulePositionSave)
  window.on('close', (event) => {
    if (quitting) return
    if (tray) {
      event.preventDefault()
      window.hide()
      return
    }
    quitting = true
  })
  window.on('closed', () => {
    mainWindow = null
  })

  window.on('show', () => {
    hasShownWindow = true
  })

  window.on('focus', () => {
    accountService.scheduleSync(0)
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (!app.isPackaged && process.env.FUJIAN_OPEN_DEVTOOLS === '1') {
    window.webContents.openDevTools({ mode: 'detach' })
  }
}

function maybeShowWindow(): void {
  if (hiddenTestMode) return
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return
  hasShownWindow = true
  mainWindow.showInactive()
}

function showWindow(focus = false): void {
  if (hiddenTestMode) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (process.platform === 'darwin' && app.isHidden()) app.show()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  if (focus) {
    mainWindow.focus()
    mainWindow.moveTop()
  }
  hasShownWindow = true
}

function toggleWindow(): void {
  if (hiddenTestMode) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
    return
  }
  showWindow(true)
}

function sendToRenderer(channel: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel)
}

function fallBackToDock(): void {
  if (process.platform !== 'darwin') return
  // If the menu bar item cannot be created, the Dock icon is the only way back
  // into the app. Better a visible Dock icon than an unreachable widget.
  void app.dock?.show()
}

function createTray(): void {
  const trayIconPath = resourcePath(
    process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'
  )
  if (!existsSync(trayIconPath)) {
    addWarning(t('托盘图标缺失，关闭窗口后将直接退出应用。'))
    fallBackToDock()
    return
  }

  try {
    const trayImage = nativeImage.createFromPath(trayIconPath)
    if (process.platform === 'darwin') {
      trayImage.setTemplateImage(true)
    }
    tray = new Tray(trayImage)
    tray.setToolTip(t('浮笺 · 桌面任务'))
    tray.on('click', toggleWindow)
    if (process.platform === 'darwin') {
      // On macOS a context menu assigned with setContextMenu replaces the
      // click action. Keep left-click toggling the widget and show the menu on
      // right-click, matching the Windows tray behaviour.
      tray.on('right-click', () => {
        if (trayMenu) tray?.popUpContextMenu(trayMenu)
      })
    }
    refreshTrayMenu()
  } catch (error) {
    addWarning(t('系统托盘创建失败：{message}', { message: messageOf(error) }))
    tray = null
    fallBackToDock()
  }
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: t('打开浮笺'),
      click: () => showWindow(true)
    },
    {
      label: t('新建任务'),
      click: () => {
        showWindow(true)
        sendToRenderer('ui:new-task')
      }
    },
    {
      label: t('新建随记'),
      click: () => {
        showWindow(true)
        sendToRenderer('ui:new-note')
      }
    },
    { type: 'separator' },
    {
      // A native checkbox item reserves a wide check column on Windows,
      // leaving a large blank gutter in the tray menu. Use a normal item
      // with a changing label instead.
      label: settings.alwaysOnTop ? t('取消窗口置顶') : t('窗口置顶'),
      click: () => {
        updateSettings({ alwaysOnTop: !settings.alwaysOnTop }, 'tray')
      }
    },
    {
      label: t('设置与归档'),
      click: () => {
        showWindow(true)
        sendToRenderer('ui:open-settings')
      }
    },
    { type: 'separator' },
    {
      label: t('退出浮笺'),
      click: quitApp
    }
  ])
}

function refreshTrayMenu(): void {
  if (!tray) return
  tray.setToolTip(t('浮笺 · 桌面任务'))
  trayMenu = buildTrayMenu()
  if (process.platform === 'darwin') {
    // Left click should keep toggling the widget instead of opening a menu.
    tray.setContextMenu(null)
    return
  }
  tray.setContextMenu(trayMenu)
}

async function generateKeywordsForNote(noteId: string): Promise<NoteKeywordsResult> {
  if (!llmService.configured) {
    return { ok: false, error: t('请先在设置中填写 DeepSeek API Key。') }
  }
  const note = notes.find((item) => item.id === noteId)
  if (!note) return { ok: false, error: t('这条随记已不存在。') }

  const result = await llmService.generateKeywords(note)
  if (!result.ok || !result.keywords) return result

  const current = notes.find((item) => item.id === noteId)
  if (!current) return { ok: false, error: t('这条随记已不存在。') }
  const keywords = result.keywords
  const next = notes.map((item) =>
    item.id === noteId
      ? {
          ...item,
          keywords,
          updatedAt: new Date().toISOString()
        }
      : item
  )
  try {
    store.saveNotes(next)
  } catch (error) {
    return { ok: false, error: messageOf(error) }
  }
  const previous = notes
  notes = next
  accountService.notesLocalSave(previous, next)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('notes:changed', next)
  }
  return { ok: true, keywords }
}

function registerIpc(): void {
  ipcMain.handle('app:bootstrap', (): BootstrapData => {
    return {
      platform:
        process.platform === 'darwin'
          ? 'darwin'
          : process.platform === 'win32'
            ? 'win32'
            : 'linux',
      tasks,
      notes,
      settings,
      theme: currentTheme(),
      version: app.getVersion(),
      language,
      materialSupported,
      material,
      autoStartSupported: autoStartSupported(),
      autoStartEnabled: autoStartSupported() ? readAutoStart() : false,
      dataDir,
      account: accountService.getState(),
      llmConfigured: llmService.configured,
      warnings: [...loadWarnings, ...runtimeWarnings]
    }
  })

  ipcMain.handle('tasks:save', (event, nextTasks: unknown): SaveTasksResult => {
    if (!isTrustedSender(event.sender.id)) return { ok: false, error: t('未知的窗口来源。') }
    try {
      if (!Array.isArray(nextTasks)) throw new Error(t('任务数据格式不正确。'))
      const validated = validateTaskList(nextTasks)
      const previous = tasks
      store.saveTasks(validated)
      tasks = validated
      accountService.taskLocalSave(previous, validated)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: messageOf(error) }
    }
  })

  ipcMain.handle('notes:save', (event, nextNotes: unknown): SaveNotesResult => {
    if (!isTrustedSender(event.sender.id)) return { ok: false, error: t('未知的窗口来源。') }
    try {
      if (!Array.isArray(nextNotes)) throw new Error(t('随记数据格式不正确。'))
      const validated = validateNoteList(nextNotes)
      const previous = notes
      store.saveNotes(validated)
      notes = validated
      accountService.notesLocalSave(previous, validated)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: messageOf(error) }
    }
  })

  ipcMain.handle(
    'notes:generate-keywords',
    async (event, noteId: unknown): Promise<NoteKeywordsResult> => {
      if (!isTrustedSender(event.sender.id)) return { ok: false, error: t('未知的窗口来源。') }
      if (typeof noteId !== 'string') return { ok: false, error: t('随记标识不正确。') }
      return generateKeywordsForNote(noteId)
    }
  )

  ipcMain.handle(
    'notes:generate-all-keywords',
    async (event): Promise<BulkKeywordsResult> => {
      if (!isTrustedSender(event.sender.id)) return { ok: false, error: t('未知的窗口来源。') }
      if (!llmService.configured) {
        return { ok: false, error: t('请先在设置中填写 DeepSeek API Key。') }
      }

      const ids = notes
        .filter((note) => note.keywords.length === 0 && !note.archivedAt)
        .map((note) => note.id)
      let generated = 0
      let failed = 0
      for (const id of ids) {
        const result = await generateKeywordsForNote(id)
        if (result.ok) generated += 1
        else failed += 1
      }
      return { ok: true, total: ids.length, generated, failed }
    }
  )

  ipcMain.handle('llm:set-key', (event, key: unknown): AccountActionResult => {
    if (!isTrustedSender(event.sender.id)) return { ok: false, error: t('未知的窗口来源。') }
    if (typeof key !== 'string') return { ok: false, error: t('API Key 格式不正确。') }
    try {
      llmService.setKey(key)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: messageOf(error) }
    }
  })

  ipcMain.handle('llm:clear-key', (event): AccountActionResult => {
    if (!isTrustedSender(event.sender.id)) return { ok: false, error: t('未知的窗口来源。') }
    try {
      llmService.clearKey()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: messageOf(error) }
    }
  })

  ipcMain.handle('account:get-state', (event) => {
    if (!isTrustedSender(event.sender.id)) return accountService.getState()
    return accountService.getState()
  })

  ipcMain.handle(
    'account:request-code',
    async (event, email: unknown): Promise<AccountActionResult> => {
      if (!isTrustedSender(event.sender.id)) return { ok: false, error: t('未知的窗口来源。') }
      if (typeof email !== 'string') return { ok: false, error: t('请输入有效的邮箱地址。') }
      try {
        return await accountService.requestLoginCode(email)
      } catch (error) {
        return { ok: false, error: messageOf(error) }
      }
    }
  )

  ipcMain.handle(
    'account:verify-code',
    async (event, email: unknown, code: unknown): Promise<AccountActionResult> => {
      if (!isTrustedSender(event.sender.id)) return { ok: false, error: t('未知的窗口来源。') }
      if (typeof email !== 'string' || typeof code !== 'string') {
        return { ok: false, error: t('邮箱或验证码格式不正确。') }
      }
      try {
        return await accountService.verifyLoginCode(email, code)
      } catch (error) {
        return { ok: false, error: messageOf(error) }
      }
    }
  )

  ipcMain.handle('account:sign-out', async (event): Promise<void> => {
    if (!isTrustedSender(event.sender.id)) throw new Error(t('未知的窗口来源。'))
    await accountService.signOut()
  })

  ipcMain.handle('sync:now', async (event): Promise<AccountActionResult> => {
    if (!isTrustedSender(event.sender.id)) return { ok: false, error: t('未知的窗口来源。') }
    return accountService.syncNow()
  })

  ipcMain.handle(
    'settings:update',
    (event, patch: unknown): SettingsResult => {
      if (!isTrustedSender(event.sender.id)) {
        return {
          settings,
          theme: currentTheme(),
          language,
          autoStartEnabled: readAutoStart(),
          error: t('未知的窗口来源。')
        }
      }
      return updateSettings(isRecord(patch) ? patch : {}, 'renderer')
    }
  )

  ipcMain.handle('app:open-data-folder', async (event): Promise<void> => {
    if (!isTrustedSender(event.sender.id)) throw new Error(t('未知的窗口来源。'))
    const error = await shell.openPath(dataDir)
    if (error) throw new Error(error)
  })

  ipcMain.on('app:quit', (event) => {
    if (!isTrustedSender(event.sender.id)) return
    quitApp()
  })

  ipcMain.on('window:resize', (event, height: unknown) => {
    if (!isTrustedSender(event.sender.id)) return
    if (typeof height !== 'number' || !Number.isFinite(height)) return
    resizeWindowToContent(height)
  })
}

function isTrustedSender(senderId: number): boolean {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.id === senderId)
}

function validateTaskList(input: unknown[]): Task[] {
  const seen = new Set<string>()
  const result: Task[] = []

  for (const value of input) {
    if (!isRecord(value)) throw new Error(t('任务数据包含无效项。'))
    const id = typeof value.id === 'string' ? value.id.trim().slice(0, 80) : ''
    const title = typeof value.title === 'string' ? value.title.trim().slice(0, 300) : ''
    const createdAt = validIsoDate(value.createdAt)
    if (!id || !title || !createdAt) throw new Error(t('任务标题或创建时间无效。'))
    if (seen.has(id)) throw new Error(t('任务标识重复。'))
    if (result.length >= 5000) throw new Error(t('任务数量超过上限。'))
    seen.add(id)

    result.push({
      id,
      title,
      note:
        typeof value.note === 'string'
          ? value.note.replace(/\r\n/g, '\n').trim().slice(0, 20_000)
          : '',
      important: value.important === true,
      urgent: value.urgent === true,
      createdAt,
      updatedAt: validIsoDate(value.updatedAt),
      archivedAt: validIsoDate(value.archivedAt)
    })
  }

  return result
}

function validateNoteList(input: unknown[]): Note[] {
  const seen = new Set<string>()
  const result: Note[] = []

  for (const value of input) {
    if (!isRecord(value)) throw new Error(t('随记数据包含无效项。'))
    const id = typeof value.id === 'string' ? value.id.trim().slice(0, 80) : ''
    const title = typeof value.title === 'string' ? value.title.trim().slice(0, 300) : ''
    const createdAt = validIsoDate(value.createdAt)
    if (!id || !title || !createdAt) throw new Error(t('随记标题或创建时间无效。'))
    if (seen.has(id)) throw new Error(t('随记标识重复。'))
    if (result.length >= 5000) throw new Error(t('随记数量超过上限。'))
    seen.add(id)

    const keywords = Array.isArray(value.keywords)
      ? value.keywords
          .filter((keyword): keyword is string => typeof keyword === 'string')
          .map((keyword) => keyword.trim().replace(/^#+/, '').slice(0, 16))
          .filter(Boolean)
          .slice(0, 8)
      : []

    result.push({
      id,
      title,
      content:
        typeof value.content === 'string'
          ? value.content.replace(/\r\n/g, '\n').trim().slice(0, 20_000)
          : '',
      keywords: [...new Set(keywords)],
      titleAuto:
        value.titleAuto === true ||
        (value.titleAuto === undefined && /^\d{8}$/.test(title)),
      important: value.important === true,
      urgent: value.urgent === true,
      createdAt,
      updatedAt: validIsoDate(value.updatedAt),
      archivedAt: validIsoDate(value.archivedAt)
    })
  }

  return result
}

function updateSettings(patch: Record<string, unknown>, source: SettingsChangedPayload['source']): SettingsResult {
  if (!settings) {
    return {
      settings: sanitizeSettings({}),
      theme: currentTheme(),
      language,
      autoStartEnabled: false,
      error: t('应用尚未完成初始化。')
    }
  }

  const next: AppSettings = { ...settings }
  if (patch.theme === 'system' || patch.theme === 'light' || patch.theme === 'dark') {
    next.theme = patch.theme
  }
  if (isLanguagePreference(patch.language)) {
    next.language = patch.language
  }
  if (typeof patch.alwaysOnTop === 'boolean') {
    next.alwaysOnTop = patch.alwaysOnTop
  }

  let error: string | undefined
  if (typeof patch.launchAtLogin === 'boolean') {
    if (autoStartSupported()) {
      const applied = applyAutoStart(
        patch.launchAtLogin,
        (message) => addWarning(t(message)),
        t('浮笺 · 桌面任务')
      )
      next.launchAtLogin = applied
      if (applied !== patch.launchAtLogin) {
        error = t('系统未能更新开机自启状态，请稍后重试。')
      }
    } else {
      next.launchAtLogin = false
      error = t('开机自启需要在打包后的正式版本中使用。')
    }
  }

  const previous = settings
  settings = next
  if (previous.language !== settings.language) {
    language = isLanguage(forcedLanguage)
      ? forcedLanguage
      : resolveLanguage(settings.language, app.getLocale())
  }

  if (previous.theme !== settings.theme) {
    nativeTheme.themeSource = settings.theme
  }

  if (mainWindow && !mainWindow.isDestroyed() && previous.alwaysOnTop !== settings.alwaysOnTop) {
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'floating')
    if (settings.alwaysOnTop && mainWindow.isVisible()) mainWindow.moveTop()
  }

  try {
    store.saveSettings(settings)
  } catch (saveError) {
    error = `${error ? `${error} ` : ''}${t('设置未能写入磁盘：{message}', {
      message: messageOf(saveError)
    })}`
    addWarning(error)
  }

  const theme = currentTheme()
  const autoStartEnabled = autoStartSupported() ? readAutoStart() : false
  const result: SettingsResult = { settings, theme, language, autoStartEnabled, ...(error ? { error } : {}) }

  if (previous.language !== settings.language) {
    installApplicationMenu(menuActions(), language)
  }
  broadcastTheme(true)
  refreshTrayMenu()
  broadcastSettings(source)

  return result
}

function broadcastTheme(force = false): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const theme = currentTheme()
  const key = `${theme.dark ? 'dark' : 'light'}:${theme.accent}`
  if (!force && key === lastThemeKey) return
  lastThemeKey = key
  sendTheme(theme)
}

function sendTheme(theme: ThemeInfo): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('theme:changed', theme)
}

function broadcastSettings(source: SettingsChangedPayload['source']): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const payload: SettingsChangedPayload = {
    source,
    settings,
    theme: currentTheme(),
    language,
    autoStartEnabled: autoStartSupported() ? readAutoStart() : false
  }
  mainWindow.webContents.send('settings:changed', payload)
}

function resizeWindowToContent(requestedHeight: number): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const height = Math.round(requestedHeight)
  if (height < 80) return

  const bounds = mainWindow.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const maxHeight = Math.max(
    WIDGET_MIN_HEIGHT,
    Math.min(WIDGET_MAX_HEIGHT, display.workArea.height - SCREEN_MARGIN * 2)
  )
  const targetHeight = Math.max(WIDGET_MIN_HEIGHT, Math.min(maxHeight, height))
  if (targetHeight === lastAppliedHeight) {
    return
  }

  lastAppliedHeight = targetHeight
  applyContentSize(mainWindow, WIDGET_WIDTH, targetHeight)

  const updated = mainWindow.getBounds()
  const area = screen.getDisplayMatching(updated).workArea
  let x = updated.x
  let y = updated.y

  if (x + updated.width > area.x + area.width - SCREEN_MARGIN) {
    x = area.x + area.width - updated.width - SCREEN_MARGIN
  }
  if (x < area.x + SCREEN_MARGIN) x = area.x + SCREEN_MARGIN
  if (y + updated.height > area.y + area.height - SCREEN_MARGIN) {
    y = area.y + area.height - updated.height - SCREEN_MARGIN
  }
  if (y < area.y + SCREEN_MARGIN) y = area.y + SCREEN_MARGIN

  if (x !== updated.x || y !== updated.y) {
    mainWindow.setPosition(Math.round(x), Math.round(y))
  }

  maybeShowWindow()
  schedulePositionSave()
}

function applyContentSize(window: BrowserWindow, width: number, height: number): void {
  window.setContentSize(width, height)
  const [contentWidth = width, contentHeight = height] = window.getContentSize()
  if (contentWidth !== width || contentHeight !== height) {
    window.setContentSize(
      width + (width - contentWidth),
      height + (height - contentHeight)
    )
  }
}

function schedulePositionSave(): void {
  if (positionSaveTimer) clearTimeout(positionSaveTimer)
  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null
    persistWindowPosition()
  }, 400)
}

function persistWindowPosition(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { x, y } = mainWindow.getBounds()
  if (settings.windowPosition?.x === x && settings.windowPosition?.y === y) return
  settings = { ...settings, windowPosition: { x, y } }
  try {
    store.saveSettings(settings)
  } catch (error) {
    addWarning(t('窗口位置保存失败：{message}', { message: messageOf(error) }))
  }
}

function keepWindowOnScreen(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const bounds = mainWindow.getBounds()
  if (positionIsVisible(bounds.x, bounds.y, bounds.width, Math.min(bounds.height, 120))) {
    return
  }
  const workArea = screen.getPrimaryDisplay().workArea
  const x = workArea.x + workArea.width - bounds.width - DEFAULT_EDGE_MARGIN
  const y = workArea.y + DEFAULT_EDGE_MARGIN
  mainWindow.setPosition(Math.max(workArea.x + SCREEN_MARGIN, x), y)
  schedulePositionSave()
}

function quitApp(): void {
  quitting = true
  persistWindowPosition()
  app.quit()
}

function addWarning(message: string): void {
  if (!runtimeWarnings.includes(message)) runtimeWarnings.push(message)
}

function resourcePath(file: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, file)
    : join(app.getAppPath(), 'resources', file)
}

function validIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  return Number.isFinite(Date.parse(value)) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

app.on('before-quit', () => {
  quitting = true
  accountService?.dispose()
  if (positionSaveTimer) {
    clearTimeout(positionSaveTimer)
    positionSaveTimer = null
  }
  persistWindowPosition()
  tray?.destroy()
  tray = null
  trayMenu = null
})

app.on('window-all-closed', () => {
  if (!tray) app.quit()
})

app.on('activate', () => {
  showWindow(true)
})

app.on('will-quit', () => {
  ipcMain.removeAllListeners()
})

process.on('uncaughtException', (error) => {
  console.error('[fujian] uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[fujian] unhandled rejection:', reason)
})
