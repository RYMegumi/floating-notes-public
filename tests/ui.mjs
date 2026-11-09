import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const electronBinary = process.platform === 'darwin'
  ? path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  : path.join(root, 'node_modules/electron/dist/electron.exe')
const shortcutModifier = process.platform === 'darwin' ? 'Meta' : 'Control'
const tmp = path.join(root, 'tests', '.tmp', 'ui')
const shots = path.join(tmp, 'shots')
fs.rmSync(tmp, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const dataDir = path.join(tmp, 'data')
fs.mkdirSync(dataDir, { recursive: true })

const now = new Date()
const iso = (minutesAgo) =>
  new Date(now.getTime() - minutesAgo * 60_000).toISOString()

const seedTasks = [
  {
    id: 'seed-both-1',
    title: '整理下周产品评审的材料',
    note: '把用户访谈里的关键阻力整理成三页。先写清楚现状，再给出两个可选方案。\n最后补一页上线节奏和风险。',
    important: true,
    urgent: true,
    createdAt: iso(600),
    updatedAt: null,
    archivedAt: null
  },
  {
    id: 'seed-both-2',
    title: '更新个人作品集首页',
    note: '',
    important: true,
    urgent: true,
    createdAt: iso(420),
    updatedAt: null,
    archivedAt: null
  },
  {
    id: 'seed-urgent',
    title: '回复客户关于交付时间的邮件',
    note: '确认周三前能给到第一版，并附上验收清单。',
    important: false,
    urgent: true,
    createdAt: iso(300),
    updatedAt: null,
    archivedAt: null
  },
  {
    id: 'seed-important',
    title: '预约周末的牙科检查',
    note: '',
    important: true,
    urgent: false,
    createdAt: iso(120),
    updatedAt: null,
    archivedAt: null
  },
  {
    id: 'seed-normal',
    title: '给阳台的绿植浇水',
    note: '',
    important: false,
    urgent: false,
    createdAt: iso(60),
    updatedAt: null,
    archivedAt: null
  }
]

fs.writeFileSync(
  path.join(dataDir, 'tasks.json'),
  JSON.stringify({ version: 1, tasks: seedTasks }, null, 2),
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

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

let app
let page
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

async function waitForWindowSettled(ms = 450) {
  await page.waitForTimeout(ms)
}

async function taskTitles() {
  return page.locator('.task__title').allTextContents()
}

async function addTask({ title, note = '', important = false, urgent = false, keyboard = false }) {
  if (keyboard) {
    await page.keyboard.press(`${shortcutModifier}+n`)
  } else {
    await page.locator('.add-button').click()
  }
  await page.locator('.composer').waitFor({ state: 'visible' })
  await page.getByLabel('任务标题').fill(title)
  if (note) await page.getByLabel('任务备注').fill(note)
  if (important) await page.locator('.flag-toggle--important').click()
  if (urgent) await page.locator('.flag-toggle--urgent').click()
  await page.locator('.composer__submit').click()
  await page.locator('.composer').waitFor({ state: 'hidden' })
  await waitForWindowSettled(300)
}

async function shot(name) {
  await waitForWindowSettled(260)
  const base64 = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.webContents.invalidate()
    await new Promise((resolve) => setTimeout(resolve, 180))
    const image = await window.webContents.capturePage()
    return image.toPNG().toString('base64')
  })
  fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(base64, 'base64'))
  console.log(`SHOT  ${name}`)
}

try {
  app = await electron.launch({
    executablePath: electronBinary,
    args: [root, '--no-sandbox'],
    cwd: root,
    env: { ...env, FUJIAN_TEST_HIDDEN: '1', FUJIAN_DATA_DIR: dataDir },
    timeout: 30_000
  })

  page = await app.firstWindow({ timeout: 30_000 })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })

  await page.locator('.app').waitFor({ state: 'visible', timeout: 15_000 })
  await waitForWindowSettled(1200)

  await page.addStyleTag({
    content: `
      html[data-theme="dark"] {
        background:
          radial-gradient(ellipse 70% 75% at 18% 22%, rgba(245, 160, 84, 0.34), transparent 58%),
          radial-gradient(ellipse 60% 70% at 88% 12%, rgba(73, 122, 255, 0.34), transparent 62%),
          radial-gradient(ellipse 70% 80% at 74% 96%, rgba(150, 91, 214, 0.23), transparent 58%),
          linear-gradient(155deg, #0a101a 0%, #121a27 46%, #1e2635 100%) !important;
        background-attachment: fixed !important;
        background-size: cover !important;
      }
      html[data-theme="light"] {
        background:
          radial-gradient(ellipse 70% 70% at 16% 16%, rgba(255, 190, 130, 0.55), transparent 60%),
          radial-gradient(ellipse 65% 70% at 90% 24%, rgba(126, 177, 243, 0.52), transparent 64%),
          radial-gradient(ellipse 80% 90% at 65% 100%, rgba(188, 158, 219, 0.28), transparent 60%),
          linear-gradient(155deg, #f7f1e9 0%, #e7edf5 52%, #dae6f1 100%) !important;
        background-attachment: fixed !important;
        background-size: cover !important;
      }
      body { background: transparent !important; }
      .app { border-radius: 10px; }
    `
  })

  check((await page.title()) === '浮笺', '应用标题为「浮笺」')
  check((await page.locator('.task').count()) === 5, '预置 5 条任务加载成功')
  check(
    JSON.stringify(await taskTitles()) ===
      JSON.stringify([
        '整理下周产品评审的材料',
        '更新个人作品集首页',
        '回复客户关于交付时间的邮件',
        '预约周末的牙科检查',
        '给阳台的绿植浇水'
      ]),
    '初始排序为：重要且紧急 > 仅紧急 > 仅重要 > 普通'
  )

  const hidden = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return { visible: window.isVisible(), alwaysOnTop: window.isAlwaysOnTop(), focused: window.isFocused() }
  })
  check(!hidden.visible && !hidden.alwaysOnTop && !hidden.focused, '自动化测试全程窗口隐藏且不抢占前台')

  const initialSize = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getContentSize()
  )
  check(initialSize[0] === 408, '窗口内容宽度固定为 408px')

  await page.locator('.pin-button').click()
  await waitForWindowSettled(350)
  check(
    (await page.locator('.pin-button').getAttribute('aria-pressed')) === 'true' &&
      (await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isAlwaysOnTop()
      )),
    '图钉按钮可以开启窗口置顶'
  )
  await page.locator('.pin-button').click()
  await waitForWindowSettled(350)
  check(
    (await page.locator('.pin-button').getAttribute('aria-pressed')) === 'false' &&
      !(await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isAlwaysOnTop()
      )),
    '再次点击图钉可取消置顶'
  )

  await shot('01-tasks-dark')

  await page.locator('.add-button').click()
  await page.locator('.composer').waitFor({ state: 'visible' })
  check(
    (await page.locator('.composer__hint').count()) === 0 &&
      !(await page.locator('.composer__footer').innerText()).includes('Enter 添加'),
    '添加任务时不再显示 Enter 添加 提示'
  )
  await page.getByLabel('任务标题').fill('准备线上故障演练的检查清单')
  await page.getByLabel('任务备注').fill('覆盖回滚步骤、告警阈值和值班联系表。')
  await page.locator('.flag-toggle--important').click()
  await page.locator('.flag-toggle--urgent').click()
  check(
    (await page.locator('.flag-toggle--important').getAttribute('aria-pressed')) === 'true' &&
      (await page.locator('.flag-toggle--urgent').getAttribute('aria-pressed')) === 'true',
    '重要与紧急标记可以同时勾选'
  )
  await shot('02-composer-dark')
  await page.locator('.composer__submit').click()
  await page.locator('.composer').waitFor({ state: 'hidden' })
  await waitForWindowSettled(350)

  await addTask({
    title: '给测试机续上证书',
    urgent: true,
    keyboard: true
  })
  await addTask({
    title: '买一包咖啡豆',
    keyboard: true
  })

  check((await page.locator('.task').count()) === 8, '通过按钮和快捷键新增任务成功')
  const orderAfterAdd = await taskTitles()
  check(
    JSON.stringify(orderAfterAdd) ===
      JSON.stringify([
        '整理下周产品评审的材料',
        '更新个人作品集首页',
        '准备线上故障演练的检查清单',
        '回复客户关于交付时间的邮件',
        '给测试机续上证书',
        '预约周末的牙科检查',
        '给阳台的绿植浇水',
        '买一包咖啡豆'
      ]),
    '同优先级按创建时间从早到晚，新任务排序正确'
  )

  check((await page.locator('.task__detail').count()) === 0, '未点击时任务列表不展示备注')
  await page.locator('.task', { hasText: '整理下周产品评审的材料' }).locator('.task__summary').click()
  await waitForWindowSettled(350)
  const expandedNote = await page.locator('.task.is-expanded .task__note').innerText()
  check(expandedNote.includes('用户访谈'), '点击任务后展开完整备注')
  await shot('03-expanded-dark')

  await page.locator('.task', { hasText: '整理下周产品评审的材料' }).getByRole('button', { name: '专注模式' }).click()
  await waitForWindowSettled(450)
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      try {
        animation.finish()
      } catch {
        // Infinite decorative animations cannot be finished; ignore them.
      }
    }
  })
  check(await page.locator('.app--focus-mode').count() === 1, '专注模式已开启')
  check(await page.locator('.task.is-dimmed').count() === 7, '专注模式下其余任务全部变暗')
  const dimOpacity = await page.locator('.task.is-dimmed').first().evaluate((element) => {
    return Number.parseFloat(window.getComputedStyle(element).opacity)
  })
  check(dimOpacity <= 0.4, '变暗任务的透明度不高于 0.4')
  check(
    (await page.locator('.task.is-focused .task__note').innerText()).includes('上线节奏'),
    '专注任务默认展示完整备注'
  )
  await shot('04-focus-dark')
  await page.getByRole('button', { name: '退出专注模式' }).click()
  await waitForWindowSettled()

  const sizeAfterFocus = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getContentSize()
  )
  check(sizeAfterFocus[1] > initialSize[1], '展开详情后窗口高度自动增长')
  check(sizeAfterFocus[1] <= 860, '自动高度不超过设定上限')

  const archiveTarget = page.locator('.task', { hasText: '更新个人作品集首页' })
  await archiveTarget.click({ button: 'right' })
  await page.locator('.context-menu').waitFor({ state: 'visible' })
  await page.getByRole('menuitem', { name: /归档/ }).click()
  await waitForWindowSettled(350)
  check(
    !(await taskTitles()).includes('更新个人作品集首页'),
    '右键归档后任务从桌面列表消失'
  )
  check(await page.locator('.toast').count() === 1, '归档后出现可撤销提示')
  await page.locator('.toast__close').click()

  await page.getByRole('button', { name: '设置与归档' }).click()
  await page.locator('.settings-view').waitFor({ state: 'visible' })
  check((await page.locator('.archive-item').count()) === 0, '归档区域默认收起')
  await page.locator('.archive-toggle').click()
  await waitForWindowSettled(250)
  check(
    await page.locator('.archive-item', { hasText: '更新个人作品集首页' }).count() === 1,
    '设置页展开后可查看已归档任务'
  )
  const settingsText = await page.locator('.settings-view').innerText()
  check(
    (await page.locator('.version-label').count()) === 0 &&
      (await page.locator('.setting-row__description').count()) === 0 &&
      !settingsText.includes('与 Windows 主题保持一致') &&
      !settingsText.includes('桌面小组件的行为') &&
      !settingsText.includes('本地保存，不上传云端') &&
      !settingsText.includes('为桌面留一点呼吸感') &&
      !settingsText.includes('让浮笺悬浮在其他窗口之上') &&
      !settingsText.includes('登录 Windows 后自动在桌面显示'),
    '设置页已移除版本号和解释性文字'
  )
  await shot('05-settings-dark')

  await page.getByRole('button', { name: '浅色' }).click()
  await waitForWindowSettled(500)
  check(
    (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light',
    '设置页可切换到浅色主题'
  )
  await shot('06-settings-light')

  await page.locator('.archive-item', { hasText: '更新个人作品集首页' })
    .getByRole('button', { name: /恢复/ })
    .click()
  await waitForWindowSettled(300)
  check(
    await page.locator('.archive-item').count() === 0,
    '归档任务可从设置页恢复'
  )
  await page.getByRole('button', { name: '返回任务列表' }).click()
  await page.locator('.settings-view').waitFor({ state: 'hidden' })
  await waitForWindowSettled(350)
  check(
    (await taskTitles()).includes('更新个人作品集首页'),
    '恢复后的任务重新出现在桌面列表并参与排序'
  )
  await shot('07-tasks-light')

  await page.getByRole('button', { name: '设置与归档' }).click()
  await page.getByRole('button', { name: '深色' }).click()
  await waitForWindowSettled(400)
  check(
    (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
    '设置页可切回深色主题'
  )
  await page.getByRole('button', { name: '返回任务列表' }).click()
  await waitForWindowSettled(350)

  const firstTask = page.locator('.task', { hasText: '整理下周产品评审的材料' })
  await firstTask.locator('.task__summary').click()
  await waitForWindowSettled(250)
  await firstTask.getByRole('button', { name: '编辑' }).click()
  await page.getByLabel('任务标题').fill('整理产品评审材料（已更新）')
  await page.getByLabel('任务备注').fill('补充一页竞品截图。')
  await page.locator('.flag-toggle--urgent').click()
  await page.locator('.composer__submit').click()
  await waitForWindowSettled(400)
  check(
    (await taskTitles()).includes('整理产品评审材料（已更新）'),
    '任务标题与备注可以编辑'
  )
  const titlesAfterEdit = await taskTitles()
  check(
    titlesAfterEdit[4] === '整理产品评审材料（已更新）' &&
      titlesAfterEdit[5] === '预约周末的牙科检查',
    '取消紧急标记后任务重新归入「仅重要」分组'
  )

  const targetForPermanentDelete = page.locator('.task', { hasText: '给阳台的绿植浇水' })
  await targetForPermanentDelete.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /归档/ }).click()
  await waitForWindowSettled(300)
  if (await page.locator('.toast').count()) await page.locator('.toast__close').click()
  await page.getByRole('button', { name: '设置与归档' }).click()
  await page.locator('.archive-toggle').click()
  await page.locator('.archive-item', { hasText: '给阳台的绿植浇水' }).waitFor()
  await shot('08-settings-final-dark')

  await page.locator('.archive-item', { hasText: '给阳台的绿植浇水' })
    .getByRole('button', { name: /永久删除/ })
    .click()
  await page.locator('.confirm-dialog').waitFor({ state: 'visible' })
  check(await page.locator('.confirm-dialog').count() === 1, '永久删除前有二次确认')
  await page.getByRole('button', { name: '取消' }).click()
  await page.locator('.confirm-dialog').waitFor({ state: 'hidden' })
  check(await page.locator('.archive-item').count() === 1, '取消删除后归档仍然保留')

  await page.locator('.archive-item', { hasText: '给阳台的绿植浇水' })
    .getByRole('button', { name: /永久删除/ })
    .click()
  await page.locator('.confirm-dialog').getByRole('button', { name: '永久删除', exact: true }).click()
  await page.locator('.confirm-dialog').waitFor({ state: 'hidden' })
  await waitForWindowSettled(300)
  check(await page.locator('.archive-item').count() === 0, '确认后归档任务被永久删除')

  const saveState = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return {
      visible: window.isVisible(),
      focused: window.isFocused(),
      bounds: window.getBounds(),
      contentSize: window.getContentSize()
    }
  })
  check(!saveState.visible && !saveState.focused, '测试结束时窗口仍未显示、未抢焦点')

  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'tasks.json'), 'utf8'))
  check(
    persisted.tasks.every((task) => task.title !== '给阳台的绿植浇水'),
    '永久删除结果已持久化到本地数据文件'
  )
  const settingsFile = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'))
  check(settingsFile.theme === 'dark', '主题选择已持久化')

  check(pageErrors.length === 0, `渲染进程无明显错误${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`)
  check(
    fs.existsSync(path.join(shots, '04-focus-dark.png')) &&
      fs.existsSync(path.join(shots, '06-settings-light.png')),
    '关键界面截图已生成'
  )

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
