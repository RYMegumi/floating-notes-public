import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const tmp = path.join(root, 'tests', '.tmp', 'i18n')
const dataDir = path.join(tmp, 'data')
const electronBinary =
  process.platform === 'darwin'
    ? path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : path.join(root, 'node_modules/electron/dist/electron.exe')

fs.rmSync(tmp, { recursive: true, force: true })
fs.mkdirSync(dataDir, { recursive: true })

const now = new Date()
const tasks = [
  {
    id: 'i18n-task-1',
    title: 'Review the release notes',
    note: 'Check the download links and version.',
    important: true,
    urgent: false,
    createdAt: new Date(now.getTime() - 60_000).toISOString(),
    updatedAt: null,
    archivedAt: null
  }
]

fs.writeFileSync(
  path.join(dataDir, 'tasks.json'),
  JSON.stringify({ version: 1, tasks }, null, 2),
  'utf8'
)
fs.writeFileSync(
  path.join(dataDir, 'settings.json'),
  JSON.stringify(
    {
      theme: 'dark',
      language: 'en',
      alwaysOnTop: false,
      launchAtLogin: false,
      windowPosition: null
    },
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

const env = { ...process.env, FUJIAN_TEST_HIDDEN: '1', FUJIAN_DATA_DIR: dataDir }
delete env.ELECTRON_RUN_AS_NODE
delete env.FUJIAN_LANGUAGE

let app
try {
  app = await electron.launch({
    executablePath: electronBinary,
    args: [root, ...(process.platform === 'win32' ? ['--no-sandbox'] : [])],
    cwd: root,
    env,
    timeout: 30_000
  })
  const page = await app.firstWindow({ timeout: 30_000 })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.locator('.app').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(700)

  check((await page.getByRole('tab', { name: 'Tasks', exact: true }).count()) === 1, 'English tabs: Tasks')
  check((await page.getByRole('tab', { name: 'Notes', exact: true }).count()) === 1, 'English tabs: Notes')
  check(
    (await page.getByRole('button', { name: 'Add task', exact: true }).count()) === 1,
    'English add button'
  )
  check(
    (await page.getByRole('button', { name: 'Settings & archive', exact: true }).count()) === 1,
    'English settings button'
  )

  await page.getByRole('button', { name: 'Settings & archive', exact: true }).click()
  await page.locator('.settings-view').waitFor({ state: 'visible' })
  check((await page.getByRole('heading', { name: 'Settings', exact: true }).count()) === 1, 'Settings heading')
  for (const heading of ['Account', 'Appearance', 'Language', 'Window', 'Archive', 'Data']) {
    check(
      (await page.getByRole('heading', { name: heading, exact: true }).count()) === 1,
      `Settings section: ${heading}`
    )
  }
  const languageSection = page
    .locator('.settings-section')
    .filter({ has: page.getByRole('heading', { name: 'Language', exact: true }) })
  check(
    (await languageSection.getByRole('button', { name: 'System', exact: true }).count()) === 1,
    'Language option: System'
  )

  await page.getByRole('button', { name: '中文', exact: true }).click()
  await page.waitForTimeout(600)
  check(
    (await page.getByRole('heading', { name: '设置', exact: true }).count()) === 1,
    'Language switch to Chinese'
  )
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.waitForTimeout(600)
  check(
    (await page.getByRole('heading', { name: 'Settings', exact: true }).count()) === 1,
    'Language switch back to English'
  )

  await page.getByRole('button', { name: 'Back to tasks', exact: true }).click()
  await page.locator('.settings-view').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.locator('.composer').waitFor({ state: 'visible' })
  check((await page.getByLabel('Task title').count()) === 1, 'English task title label')
  check((await page.getByLabel('Task note').count()) === 1, 'English task note label')
  await page.getByLabel('Task title').fill('English task from test')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForTimeout(500)
  check(
    (await page.locator('.task__title', { hasText: 'English task from test' }).count()) === 1,
    'Can add a task in English UI'
  )

  await page.getByRole('tab', { name: 'Notes', exact: true }).click()
  await page.waitForTimeout(300)
  check((await page.getByRole('button', { name: 'Add note', exact: true }).count()) === 1, 'English add note button')
  check(pageErrors.length === 0, 'English UI has no renderer errors')
} catch (error) {
  failed += 1
  failures.push(`exception: ${String(error)}`)
  console.error(error)
} finally {
  await app?.close()
}

console.log(`\nRESULT passed=${passed} failed=${failed}`)
if (failed) {
  console.log('Failures:', failures)
  process.exit(1)
}
