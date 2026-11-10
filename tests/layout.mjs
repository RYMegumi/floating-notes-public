import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const electronBinary = process.platform === 'darwin'
  ? path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  : path.join(root, 'node_modules/electron/dist/electron.exe')
const dir = path.join(root, 'tests', '.tmp', 'layout')
const dataDir = path.join(dir, 'data')
const startupDir = path.join(dir, 'startup')
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(startupDir, { recursive: true })

const now = new Date()
const task = {
  id: 'layout-one-task',
  title: '只有一项待办时的布局',
  note: '',
  important: false,
  urgent: false,
  createdAt: new Date(now.getTime() - 60_000).toISOString(),
  updatedAt: null,
  archivedAt: null
}

fs.writeFileSync(
  path.join(dataDir, 'tasks.json'),
  JSON.stringify({ version: 1, tasks: [task] }, null, 2),
  'utf8'
)
fs.writeFileSync(
  path.join(dataDir, 'settings.json'),
  JSON.stringify(
    { theme: 'dark', alwaysOnTop: false, launchAtLogin: false, windowPosition: null },
    null,
    2
  ),
  'utf8'
)

let passed = 0
let failed = 0
const failures = []

function check(condition, message) {
  if (condition) {
    passed += 1
    console.log(`PASS  ${message}`)
  } else {
    failed += 1
    failures.push(message)
    console.error(`FAIL  ${message}`)
  }
}

const env = {
  ...process.env,
  FUJIAN_TEST_HIDDEN: '1',
  FUJIAN_LANGUAGE: 'zh-CN',
  FUJIAN_DATA_DIR: dataDir,
  FUJIAN_STARTUP_DIR: startupDir
}
delete env.ELECTRON_RUN_AS_NODE

let app
try {
  app = await electron.launch({
    executablePath: electronBinary,
    args: [root, '--no-sandbox'],
    cwd: root,
    env,
    timeout: 30_000
  })
  const page = await app.firstWindow({ timeout: 30_000 })
  await page.locator('.app').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(1000)

  const geometry = await page.evaluate(() => {
    const appEl = document.querySelector('.app')
    if (!(appEl instanceof HTMLElement)) throw new Error('missing .app')
    const style = getComputedStyle(document.body)
    const appRect = appEl.getBoundingClientRect()
    return {
      contentHeight:
        Math.ceil(appRect.height) +
        (Number.parseFloat(style.paddingTop) || 0) +
        (Number.parseFloat(style.paddingBottom) || 0),
      innerHeight,
      innerWidth,
      appBottom: appRect.bottom,
      taskCount: document.querySelectorAll('.task').length
    }
  })
  const windowState = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return { contentSize: window.getContentSize() }
  })

  check(geometry.taskCount === 1, '单任务布局已加载')
  check(
    Math.abs(windowState.contentSize[1] - geometry.contentHeight) <= 1,
    '窗口高度与单任务内容高度一致，没有底部空白'
  )
  check(
    geometry.innerHeight - geometry.appBottom <= 1,
    '内容表面一直铺到窗口底部'
  )

  const dragEdges = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) return null
      const bounds = element.getBoundingClientRect()
      return {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
        region: getComputedStyle(element).getPropertyValue('-webkit-app-region')
      }
    }
    return {
      top: rect('.window-drag-edge--top'),
      left: rect('.window-drag-edge--left'),
      right: rect('.window-drag-edge--right'),
      addButton: rect('.add-button')
    }
  })
  check(
    dragEdges.top?.top === 0 &&
      dragEdges.top.width === geometry.innerWidth &&
      dragEdges.top.height === 16 &&
      dragEdges.left?.left === 0 &&
      dragEdges.right?.right === geometry.innerWidth &&
      dragEdges.top.region === 'drag' &&
      dragEdges.left.region === 'drag' &&
      dragEdges.right.region === 'drag',
    '顶部与左右边缘都有拖拽热区'
  )
  check(
    dragEdges.top?.bottom != null &&
      dragEdges.addButton != null &&
      dragEdges.top.bottom <= dragEdges.addButton.top,
    '边缘拖拽区没有覆盖顶部按钮'
  )

  await page.locator('.add-button').click()
  await page.locator('.composer').waitFor({ state: 'visible' })
  check(
    (await page.locator('.composer__hint').count()) === 0 &&
      !(await page.locator('.composer__footer').innerText()).includes('Enter 添加'),
    '添加面板不再显示 Enter 添加 提示'
  )

  console.log(`\nRESULT passed=${passed} failed=${failed}`)
  if (failed) console.log('Failures:', failures)
} catch (error) {
  failed += 1
  console.error('TEST CRASH:', error)
} finally {
  try { await app?.close() } catch { /* ignore */ }
  fs.rmSync(dir, { recursive: true, force: true })
}

process.exit(failed ? 1 : 0)
