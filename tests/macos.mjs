import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

if (process.platform !== 'darwin') {
  console.log('SKIP  macOS-only test')
  process.exit(0)
}

const root = process.cwd()
const tmp = path.join(root, 'tests', '.tmp', 'macos')
const dataDir = path.join(tmp, 'data')
fs.rmSync(tmp, { recursive: true, force: true })
fs.mkdirSync(dataDir, { recursive: true })

const now = new Date()
fs.writeFileSync(
  path.join(dataDir, 'tasks.json'),
  JSON.stringify(
    {
      version: 1,
      tasks: [
        {
          id: 'macos-test-task',
          title: 'macOS 原生行为检查',
          note: '',
          important: false,
          urgent: false,
          createdAt: new Date(now.getTime() - 60_000).toISOString(),
          updatedAt: null,
          archivedAt: null
        }
      ]
    },
    null,
    2
  ),
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
  FUJIAN_DATA_DIR: dataDir
}
delete env.ELECTRON_RUN_AS_NODE

let app
try {
  app = await electron.launch({
    executablePath: path.join(
      root,
      'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
    ),
    args: [root],
    cwd: root,
    env,
    timeout: 30_000
  })
  const page = await app.firstWindow({ timeout: 30_000 })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })

  await page.locator('.app').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(1000)

  const native = await app.evaluate(({ BrowserWindow, app, Menu }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return {
      platform: process.platform,
      version: process.getSystemVersion(),
      contentSize: window.getContentSize(),
      visible: window.isVisible(),
      focused: window.isFocused(),
      alwaysOnTop: window.isAlwaysOnTop(),
      dockVisible: app.dock ? app.dock.isVisible() : null,
      menu: Menu.getApplicationMenu()?.items.map((item) => ({
        label: item.label,
        items: item.submenu?.items.map((child) => ({
          label: child.label,
          accelerator: child.accelerator
        }))
      }))
    }
  })

  check(native.platform === 'darwin', '运行在 macOS')
  check(native.contentSize[0] === 408, '窗口内容宽度保持 408px')
  check(!native.visible && !native.focused, '测试模式窗口隐藏且不抢焦点')
  check(native.dockVisible === false, 'Dock 图标已隐藏，应用作为菜单栏挂件运行')

  const appMenu = native.menu?.find((item) => item.label === '浮笺')
  const fileMenu = native.menu?.find((item) => item.label === '文件')
  const settingsItem = appMenu?.items.find((item) => item.label?.startsWith('设置'))
  const newTaskItem = fileMenu?.items.find((item) => item.label === '新建任务')

  check(Boolean(settingsItem), '应用菜单包含「设置与归档」')
  check(settingsItem?.accelerator === 'Command+,', '设置快捷键为 Command+,')
  check(Boolean(newTaskItem), '文件菜单包含「新建任务」')
  check(newTaskItem?.accelerator === 'Command+N', '新建任务快捷键为 Command+N')

  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    const file = menu?.items.find((item) => item.label === '文件')
    file?.submenu?.items.find((item) => item.label === '新建任务')?.click()
  })
  await page.locator('.composer').waitFor({ state: 'visible', timeout: 5000 })
  check(true, '菜单「新建任务」可以打开输入面板')
  await page.keyboard.press('Escape')
  await page.locator('.composer').waitFor({ state: 'hidden', timeout: 5000 })

  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    const appMenu = menu?.items.find((item) => item.label === '浮笺')
    appMenu?.submenu?.items.find((item) => item.label?.startsWith('设置'))?.click()
  })
  await page.locator('.settings-view').waitFor({ state: 'visible', timeout: 5000 })
  check(true, '菜单「设置与归档」可以打开设置页')
  check(
    (await page.evaluate(() => document.documentElement.dataset.platform)) === 'darwin',
    '渲染层识别 macOS 平台样式'
  )
  check(
    (await page.evaluate(() => document.documentElement.dataset.material)) === 'vibrancy',
    '渲染层使用玻璃/半透明材质'
  )

  check(pageErrors.length === 0, `渲染进程无错误${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`)

  console.log(`\nRESULT passed=${passed} failed=${failed}`)
  if (failed) console.log('Failures:', failures)
} catch (error) {
  failed += 1
  console.error('TEST CRASH:', error)
} finally {
  try {
    await app?.close()
  } catch (error) {
    console.error('cleanup:', error)
  }
}

process.exit(failed ? 1 : 0)
