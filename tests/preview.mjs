import { chromium } from 'playwright-core'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const root = process.cwd()
const rendererDir = path.join(root, 'out', 'renderer')
const docsDir = path.join(root, 'docs', 'raw')
fs.mkdirSync(docsDir, { recursive: true })

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml'
}

const server = http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    const filePath = path.resolve(rendererDir, relative)
    if (!filePath.startsWith(rendererDir)) {
      response.writeHead(403).end('Forbidden')
      return
    }
    const content = fs.readFileSync(filePath)
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store'
    })
    response.end(content)
  } catch {
    response.writeHead(404).end('Not found')
  }
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const baseUrl = `http://127.0.0.1:${port}/index.html`

const now = new Date()
const iso = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60_000).toISOString()
const yesterday = new Date(now.getTime() - 26 * 60 * 60_000).toISOString()

const activeTasks = [
  {
    id: 'preview-1',
    title: '整理下周产品评审的材料',
    note: '把用户访谈里的关键阻力整理成三页。先写清楚现状，再给出两个可选方案。\n最后补一页上线节奏和风险。',
    important: true,
    urgent: true,
    createdAt: iso(680),
    updatedAt: null,
    archivedAt: null
  },
  {
    id: 'preview-2',
    title: '更新个人作品集首页',
    note: '',
    important: true,
    urgent: true,
    createdAt: iso(510),
    updatedAt: null,
    archivedAt: null
  },
  {
    id: 'preview-3',
    title: '回复客户关于交付时间的邮件',
    note: '确认周三前能给到第一版，并附上验收清单。',
    important: false,
    urgent: true,
    createdAt: iso(390),
    updatedAt: null,
    archivedAt: null
  },
  {
    id: 'preview-4',
    title: '给测试机续上证书',
    note: '',
    important: false,
    urgent: true,
    createdAt: iso(260),
    updatedAt: null,
    archivedAt: null
  },
  {
    id: 'preview-5',
    title: '预约周末的牙科检查',
    note: '',
    important: true,
    urgent: false,
    createdAt: iso(120),
    updatedAt: null,
    archivedAt: null
  },
  {
    id: 'preview-6',
    title: '给阳台的绿植浇水',
    note: '',
    important: false,
    urgent: false,
    createdAt: iso(70),
    updatedAt: null,
    archivedAt: null
  },
  {
    id: 'preview-7',
    title: '买一包咖啡豆',
    note: '',
    important: false,
    urgent: false,
    createdAt: iso(25),
    updatedAt: null,
    archivedAt: null
  }
]

const archivedTasks = [
  {
    id: 'preview-archived',
    title: '修复登录页的按钮错位',
    note: '问题出在小屏下的 flex 换行，已补上回归截图。',
    important: true,
    urgent: false,
    createdAt: iso(1800),
    updatedAt: null,
    archivedAt: yesterday
  }
]

const wallpaperCss = `
  html[data-theme="dark"] {
    background:
      radial-gradient(ellipse 48% 55% at 14% 18%, rgba(255, 187, 105, 0.34), transparent 70%),
      radial-gradient(ellipse 44% 52% at 82% 12%, rgba(83, 135, 255, 0.30), transparent 72%),
      radial-gradient(ellipse 55% 65% at 78% 92%, rgba(194, 91, 201, 0.22), transparent 72%),
      linear-gradient(155deg, #0a101a 0%, #111925 48%, #1d2330 100%) !important;
    background-attachment: fixed !important;
    background-size: cover !important;
  }
  html[data-theme="light"] {
    background:
      radial-gradient(ellipse 48% 55% at 14% 18%, rgba(255, 198, 145, 0.58), transparent 68%),
      radial-gradient(ellipse 50% 52% at 82% 12%, rgba(133, 184, 255, 0.50), transparent 70%),
      radial-gradient(ellipse 55% 65% at 78% 92%, rgba(218, 186, 255, 0.30), transparent 68%),
      linear-gradient(155deg, #f6efe5 0%, #e8eff8 48%, #d9e6f5 100%) !important;
    background-attachment: fixed !important;
    background-size: cover !important;
  }
  body {
    background: transparent !important;
    overflow-x: hidden !important;
  }
  .app {
    border-radius: 12px;
    -webkit-backdrop-filter: blur(20px) saturate(1.1);
    backdrop-filter: blur(20px) saturate(1.1);
  }
`

function mockInitialization(payload) {
  const tasks = structuredClone(payload.tasks)
  const notes = structuredClone(payload.notes ?? [])
  const settings = structuredClone(payload.settings)
  const theme = structuredClone(payload.theme)
  let autoStartEnabled = false
  const listeners = {
    theme: new Set(),
    settings: new Set(),
    openSettings: new Set(),
    newTask: new Set(),
    account: new Set(),
    tasks: new Set(),
    notes: new Set(),
    newNote: new Set()
  }

  const subscribe = (set, handler) => {
    set.add(handler)
    return () => set.delete(handler)
  }

  const themeResult = () => ({ ...theme })
  const settingsResult = (error) => ({
    settings: { ...settings },
    theme: themeResult(),
    autoStartEnabled,
    ...(error ? { error } : {})
  })

  const api = {
    getBootstrap: async () => ({
      tasks: structuredClone(tasks),
      notes: structuredClone(notes),
      settings: { ...settings },
      theme: themeResult(),
      version: '1.4.0',
      platform: payload.platform ?? 'win32',
      materialSupported: true,
      material: payload.material ?? 'acrylic',
      autoStartSupported: true,
      autoStartEnabled,
      dataDir: payload.dataDir,
      account: {
        configured: true,
        user: null,
        sync: { status: 'idle', lastSyncedAt: null }
      },
      llmConfigured: Boolean(payload.llmConfigured),
      warnings: []
    }),
    saveTasks: async (nextTasks) => {
      tasks.splice(0, tasks.length, ...structuredClone(nextTasks))
      return { ok: true }
    },
    saveNotes: async (nextNotes) => {
      notes.splice(0, notes.length, ...structuredClone(nextNotes))
      listeners.notes.forEach((handler) => handler(structuredClone(notes)))
      return { ok: true }
    },
    updateSettings: async (patch) => {
      Object.assign(settings, patch)
      if (patch.theme === 'dark') theme.dark = true
      if (patch.theme === 'light') theme.dark = false
      if (patch.theme === 'system') theme.dark = payload.systemDark
      if (typeof patch.launchAtLogin === 'boolean') autoStartEnabled = patch.launchAtLogin
      const result = settingsResult()
      listeners.settings.forEach((handler) => handler({ ...result, source: 'renderer' }))
      listeners.theme.forEach((handler) => handler(themeResult()))
      return result
    },
    resizeWindow: () => undefined,
    openDataFolder: async () => undefined,
    quit: () => undefined,
    getAccountState: async () => ({
      configured: true,
      user: null,
      sync: { status: 'idle', lastSyncedAt: null }
    }),
    requestLoginCode: async () => ({ ok: true }),
    verifyLoginCode: async () => ({ ok: true }),
    signOut: async () => undefined,
    syncNow: async () => ({ ok: true }),
    setLlmKey: async () => ({ ok: true }),
    clearLlmKey: async () => ({ ok: true }),
    generateNoteKeywords: async () => ({ ok: false, error: '预览模式不调用模型。' }),
    generateAllNoteKeywords: async () => ({ ok: false, error: '预览模式不调用模型。' }),
    onThemeChanged: (handler) => subscribe(listeners.theme, handler),
    onSettingsChanged: (handler) => subscribe(listeners.settings, handler),
    onAccountChanged: (handler) => subscribe(listeners.account, handler),
    onTasksChanged: (handler) => subscribe(listeners.tasks, handler),
    onNotesChanged: (handler) => subscribe(listeners.notes, handler),
    onOpenSettings: (handler) => subscribe(listeners.openSettings, handler),
    onNewTask: (handler) => subscribe(listeners.newTask, handler),
    onNewNote: (handler) => subscribe(listeners.newNote, handler)
  }

  Object.defineProperty(window, 'fujian', {
    configurable: true,
    value: api
  })
}

const browserCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean)
const browserExecutable = browserCandidates.find((candidate) => fs.existsSync(candidate))
if (!browserExecutable) {
  console.error('未找到本机 Chrome 或 Edge。可通过 CHROME_PATH 指定浏览器路径。')
  process.exit(1)
}

const env = { ...process.env, FUJIAN_LANGUAGE: 'zh-CN' }
const browser = await chromium.launch({
  executablePath: browserExecutable,
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars'],
  env
})

async function openPreview(theme) {
  const context = await browser.newContext({
    viewport: { width: 408, height: 1200 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: 'no-preference'
  })
  const page = await context.newPage()
  await page.addInitScript(mockInitialization, {
    platform: process.env.PREVIEW_PLATFORM ?? 'win32',
    material: process.env.PREVIEW_PLATFORM === 'darwin' ? 'vibrancy' : 'acrylic',
    tasks: [...activeTasks, ...archivedTasks],
    settings: {
      theme,
      alwaysOnTop: false,
      launchAtLogin: false,
      windowPosition: null
    },
    theme: {
      dark: theme === 'dark',
      accent: '#4f8cff',
      onAccent: '#ffffff'
    },
    systemDark: false,
    dataDir: 'C:\\Users\\Jiang\\AppData\\Roaming\\Fujian'
  })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.locator('.app').waitFor({ state: 'visible' })
  await page.addStyleTag({ content: wallpaperCss })
  await page.waitForTimeout(450)
  return { context, page }
}

async function screenshotApp(page, name) {
  await page.waitForTimeout(320)
  const box = await page.locator('.app').boundingBox()
  if (!box) throw new Error(`Missing app bounds for ${name}`)
  await page.screenshot({
    path: path.join(docsDir, `${name}.png`),
    clip: {
      x: Math.floor(box.x),
      y: Math.floor(box.y),
      width: Math.ceil(box.width),
      height: Math.ceil(box.height)
    }
  })
  console.log(`SHOT  docs/${name}.png  (${Math.ceil(box.width)}x${Math.ceil(box.height)} CSS px)`)
}

try {
  {
    const { context, page } = await openPreview('dark')
    await screenshotApp(page, 'preview-dark')
    await context.close()
  }

  {
    const { context, page } = await openPreview('light')
    await screenshotApp(page, 'preview-light')
    await context.close()
  }

  {
    const { context, page } = await openPreview('dark')
    await page.locator('.task', { hasText: '整理下周产品评审的材料' }).locator('.task__summary').click()
    await page.waitForTimeout(300)
    await page.locator('.task', { hasText: '整理下周产品评审的材料' }).getByRole('button', { name: '专注模式' }).click()
    await page.waitForTimeout(500)
    await screenshotApp(page, 'preview-focus-dark')
    await context.close()
  }

  {
    const { context, page } = await openPreview('dark')
    await page.locator('.add-button').click()
    await page.getByLabel('任务标题').fill('准备线上故障演练的检查清单')
    await page.getByLabel('任务备注').fill('覆盖回滚步骤、告警阈值和值班联系表。')
    await page.locator('.flag-toggle--important').click()
    await page.locator('.flag-toggle--urgent').click()
    if ((await page.locator('.flag-toggle--important').getAttribute('aria-pressed')) !== 'true') {
      throw new Error('Important flag did not become active')
    }
    await screenshotApp(page, 'preview-composer-dark')
    await context.close()
  }

  {
    const { context, page } = await openPreview('dark')
    await page.getByRole('button', { name: '设置与归档' }).click()
    await page.locator('.settings-view').waitFor({ state: 'visible' })
    await screenshotApp(page, 'preview-settings-dark')
    await context.close()
  }

  {
    const { context, page } = await openPreview('light')
    await page.getByRole('button', { name: '设置与归档' }).click()
    await page.locator('.settings-view').waitFor({ state: 'visible' })
    await screenshotApp(page, 'preview-settings-light')
    await context.close()
  }

  {
    const { context, page } = await openPreview('dark')
    const target = page.locator('.task', { hasText: '回复客户关于交付时间的邮件' })
    await target.click({ button: 'right' })
    await page.locator('.context-menu').waitFor({ state: 'visible' })
    await screenshotApp(page, 'preview-context-dark')
    await context.close()
  }
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}

console.log('Preview generation complete.')
