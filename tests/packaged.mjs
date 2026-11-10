import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const tmp = path.join(root, 'tests', '.tmp', 'packaged')
fs.rmSync(tmp, { recursive: true, force: true })
fs.mkdirSync(tmp, { recursive: true })
const dataDir = path.join(tmp, 'data')
const startupDir = path.join(tmp, 'startup')
fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(startupDir, { recursive: true })

const executable = path.join(root, 'dist', 'win-unpacked', '浮笺.exe')
if (!fs.existsSync(executable)) {
  console.error(`Packaged executable not found: ${executable}`)
  process.exit(1)
}

const env = { ...process.env, FUJIAN_LANGUAGE: 'zh-CN' }
delete env.ELECTRON_RUN_AS_NODE

let app
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

try {
  app = await electron.launch({
    executablePath: executable,
    args: ['--no-sandbox'],
    cwd: path.dirname(executable),
    env: {
      ...env,
      FUJIAN_TEST_HIDDEN: '1',
      FUJIAN_DATA_DIR: dataDir,
      FUJIAN_STARTUP_DIR: startupDir
    },
    timeout: 30_000
  })

  const page = await app.firstWindow({ timeout: 30_000 })
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.locator('.app').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(900)

  const packagedState = await app.evaluate(({ app: electronApp, BrowserWindow }) => ({
    isPackaged: electronApp.isPackaged,
    name: electronApp.getName(),
    version: electronApp.getVersion(),
    userData: electronApp.getPath('userData'),
    visible: BrowserWindow.getAllWindows()[0].isVisible(),
    focused: BrowserWindow.getAllWindows()[0].isFocused()
  }))
  check(packagedState.isPackaged, '正在运行打包后的应用')
  check(packagedState.version === '1.3.0', '打包版本号为 1.3.0')
  check(!packagedState.visible && !packagedState.focused, '打包应用测试窗口保持隐藏')
  check(
    packagedState.userData.toLowerCase() === dataDir.toLowerCase(),
    '测试数据目录隔离成功'
  )

  await page.getByRole('button', { name: '设置与归档' }).click()
  await page.locator('.settings-view').waitFor({ state: 'visible' })
  const autoStartSwitch = page.getByRole('switch', { name: '开机自启' })
  check(await autoStartSwitch.count() === 1, '设置页出现开机自启开关')
  check(!(await autoStartSwitch.isDisabled()), '打包版开机自启开关可用')

  await autoStartSwitch.click()
  await page.waitForTimeout(700)
  const shortcutPath = path.join(startupDir, '浮笺.lnk')
  check(fs.existsSync(shortcutPath), '开启后创建 Windows 启动快捷方式')
  check(
    (await autoStartSwitch.getAttribute('aria-checked')) === 'true',
    '开机自启开关切换到开启状态'
  )

  if (fs.existsSync(shortcutPath)) {
    const link = await app.evaluate(({ shell }, shortcut) => {
      try {
        const details = shell.readShortcutLink(shortcut)
        return { target: details.target, args: details.args, description: details.description }
      } catch (error) {
        return { error: String(error) }
      }
    }, shortcutPath)
    console.log('      shortcut:', link)
    check(
      link.target?.toLowerCase() === executable.toLowerCase(),
      '启动快捷方式指向当前应用可执行文件'
    )
  }

  await autoStartSwitch.click()
  await page.waitForTimeout(500)
  check(!fs.existsSync(shortcutPath), '关闭后移除启动快捷方式')
  check(
    (await autoStartSwitch.getAttribute('aria-checked')) === 'false',
    '开机自启开关切换到关闭状态'
  )

  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'))
  check(saved.launchAtLogin === false, '开机自启状态写入本地设置')

  check(errors.length === 0, `打包版渲染进程无错误${errors.length ? `: ${errors.join(' | ')}` : ''}`)
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
