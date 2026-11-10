import { chromium } from 'playwright-core'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const appData = process.env.APPDATA
const stablePath = 'C:\\Users\\jiang\\Apps\\浮笺\\浮笺.exe'
const legacyPath = 'C:\\Users\\jiang\\Apps\\浮笺\\浮笺-1.3.0-便携版.exe'
const exePath = fs.existsSync(stablePath) ? stablePath : legacyPath
const dataDir = path.join(appData, 'Fujian')
const startupLink = path.join(
  appData,
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup',
  '浮笺.lnk'
)

let passed = 0
let failed = 0
const failures = []
const preexistingData = fs.existsSync(dataDir)
const preexistingStartup = fs.existsSync(startupLink)
let child
let browser
let page

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

function readShortcutTarget(shortcutPath) {
  const escaped = shortcutPath.replace(/'/g, "''")
  const command =
    `$w = New-Object -ComObject WScript.Shell; ` +
    `$s = $w.CreateShortcut('${escaped}'); ` +
    `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); ` +
    `Write-Output $s.TargetPath`
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true
  }).trim()
}

function waitForExit(process, timeoutMs) {
  return new Promise((resolve) => {
    if (!process || process.exitCode !== null) return resolve(true)
    const timer = setTimeout(() => resolve(false), timeoutMs)
    process.once('exit', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

async function waitForDevtools(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`portable launcher exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetch('http://127.0.0.1:9345/json/version', {
        signal: AbortSignal.timeout(2000)
      })
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`DevTools endpoint did not become ready: ${lastError ?? 'timeout'}`)
}

try {
  if (preexistingData) {
    throw new Error(`Refusing to overwrite existing user data at ${dataDir}`)
  }
  if (preexistingStartup) {
    throw new Error(`Refusing to overwrite existing startup shortcut at ${startupLink}`)
  }

  console.log('Launching single-file portable EXE from C: (hidden)...')
  const env = { ...process.env, FUJIAN_TEST_HIDDEN: '1', FUJIAN_LANGUAGE: 'zh-CN' }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.FUJIAN_DATA_DIR
  delete env.FUJIAN_STARTUP_DIR
  child = spawn(exePath, ['--remote-debugging-port=9345'], {
    cwd: path.dirname(exePath),
    env,
    stdio: 'ignore',
    windowsHide: true
  })

  await waitForDevtools()
  browser = await chromium.connectOverCDP('http://127.0.0.1:9345')

  const deadline = Date.now() + 20_000
  while (!page && Date.now() < deadline) {
    const contexts = browser.contexts()
    const pages = contexts.flatMap((context) => context.pages())
    page = pages.find((candidate) => candidate.url().startsWith('file:')) ?? pages[0] ?? null
    if (!page) await new Promise((resolve) => setTimeout(resolve, 300))
  }
  if (!page) throw new Error('No renderer page appeared over CDP')

  await page.locator('.app').waitFor({ state: 'visible', timeout: 20_000 })
  await page.waitForTimeout(800)
  check((await page.title()) === '浮笺', '单文件便携版从 C: 盘正常启动')

  const visibleState = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    data: document.documentElement.dataset,
    bodyText: document.body.innerText.slice(0, 200)
  }))
  check(visibleState.innerWidth === 408, '窗口内容宽度正常')
  check(!visibleState.bodyText.includes('浮笺没能启动'), '应用初始化没有进入错误状态')

  await page.locator('.add-button').click()
  await page.getByLabel('任务标题').fill('C 盘集成测试')
  await page.getByLabel('任务备注').fill('验证单文件便携版在 C: 盘保存数据。')
  await page.locator('.composer__submit').click()
  await page.waitForTimeout(900)
  check((await page.locator('.task').count()) === 1, '可在 C: 盘运行实例中新增任务')

  check(fs.existsSync(dataDir), '默认用户数据目录已在 C: 盘创建')
  const tasksPath = path.join(dataDir, 'tasks.json')
  check(fs.existsSync(tasksPath), '任务数据文件已成功写入 C: 盘')
  const saved = fs.existsSync(tasksPath)
    ? JSON.parse(fs.readFileSync(tasksPath, 'utf8'))
    : { tasks: [] }
  check(
    saved.tasks.some((task) => task.title === 'C 盘集成测试'),
    '新增任务已持久化到 C: 盘'
  )

  await page.getByRole('button', { name: '设置与归档' }).click()
  await page.locator('.settings-view').waitFor({ state: 'visible' })
  const autoStartSwitch = page.getByRole('switch', { name: '开机自启' })
  check(!(await autoStartSwitch.isDisabled()), 'C: 盘运行实例的开机自启开关可用')
  await autoStartSwitch.click()
  await page.waitForTimeout(900)
  check(fs.existsSync(startupLink), '可创建真实的 Windows 启动快捷方式')
  let shortcutTarget = ''
  if (fs.existsSync(startupLink)) {
    shortcutTarget = readShortcutTarget(startupLink)
    check(
      path.resolve(shortcutTarget).toLowerCase() === path.resolve(exePath).toLowerCase(),
      '启动快捷方式指向 C: 盘的单文件 exe，而不是临时解压目录'
    )
  }
  await autoStartSwitch.click()
  await page.waitForTimeout(700)
  check(!fs.existsSync(startupLink), '关闭开关后移除启动快捷方式')
  check(
    (await autoStartSwitch.getAttribute('aria-checked')) === 'false',
    '开机自启最终恢复为关闭状态'
  )

  await page.getByRole('button', { name: '退出浮笺' }).click()
  const exited = await waitForExit(child, 30_000)
  check(exited, '退出应用后便携启动器正常结束')

  if (exited && !fs.existsSync(startupLink) && !preexistingData) {
    fs.rmSync(dataDir, { recursive: true, force: true })
    console.log('CLEAN  removed test user-data directory')
  }

  check(!fs.existsSync(startupLink), '测试结束没有残留启动快捷方式')
  check(!fs.existsSync(dataDir), '测试结束清理了临时用户数据')

  console.log(`\nRESULT passed=${passed} failed=${failed}`)
  if (failed) console.log('Failures:', failures)
} catch (error) {
  failed += 1
  console.error('TEST CRASH:', error)
  if (preexistingData) {
    console.error('User data was pre-existing and was left untouched.')
  }
} finally {
  try {
    await browser?.close()
  } catch {
    // ignore
  }

  if (child && child.exitCode === null) {
    try {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      })
    } catch {
      // ignore
    }
    await waitForExit(child, 10_000)
  }

  if (fs.existsSync(startupLink) && !preexistingStartup) {
    try { fs.rmSync(startupLink, { force: true }) } catch { /* ignore */ }
  }
  if (!preexistingData && fs.existsSync(dataDir)) {
    try { fs.rmSync(dataDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

process.exit(failed ? 1 : 0)
