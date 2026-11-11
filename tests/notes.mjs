import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const tmp = path.join(root, 'tests', '.tmp', 'notes')
const dataDir = path.join(tmp, 'data')
const electronBinary =
  process.platform === 'darwin'
    ? path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : path.join(root, 'node_modules/electron/dist/electron.exe')

fs.rmSync(tmp, { recursive: true, force: true })
fs.mkdirSync(dataDir, { recursive: true })

const now = new Date()
const iso = (minutesAgo) =>
  new Date(now.getTime() - minutesAgo * 60_000).toISOString()

const tasks = [
  {
    id: 'note-test-task',
    title: '待办仍然正常工作',
    note: '',
    important: false,
    urgent: false,
    createdAt: iso(600),
    updatedAt: null,
    archivedAt: null
  }
]

const notes = [
  {
    id: 'note-a',
    title: '关于新版本导航的想法',
    content: '滑块的切换方式要足够轻，不要打断列表的阅读。',
    keywords: ['导航', '交互', '克制'],
    important: true,
    urgent: true,
    createdAt: iso(500),
    updatedAt: null
  },
  {
    id: 'note-b',
    title: '周末想去的咖啡馆',
    content: '找一家有自然光、可以坐一下午的店。',
    keywords: ['周末', '咖啡馆'],
    important: false,
    urgent: true,
    createdAt: iso(400),
    updatedAt: null
  },
  {
    id: 'note-c',
    title: '给随记加关键词',
    content: '让标题后面跟一行暗色关键词。',
    keywords: [],
    important: true,
    urgent: false,
    createdAt: iso(300),
    updatedAt: null
  },
  {
    id: 'note-d',
    title: '一个很轻的念头',
    content: '',
    keywords: [],
    important: false,
    urgent: false,
    createdAt: iso(200),
    updatedAt: null
  }
]

fs.writeFileSync(
  path.join(dataDir, 'tasks.json'),
  JSON.stringify({ version: 1, tasks }, null, 2),
  'utf8'
)
fs.writeFileSync(
  path.join(dataDir, 'notes.json'),
  JSON.stringify({ version: 1, notes }, null, 2),
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
  FUJIAN_DATA_DIR: dataDir
}
delete env.ELECTRON_RUN_AS_NODE

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
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })

  await page.locator('.app').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(900)

  const noteTitles = () => page.locator('.note .task__title').allTextContents()

  check((await page.locator('.view-switch').count()) === 1, '主页面有待办 / 随记切换控件')
  check((await noteTitles()).length === 0, '默认仍显示待办视图')

  await page.getByRole('tab', { name: '随记' }).click()
  await page.waitForTimeout(400)
  check(
    (await page.getByRole('tab', { name: '随记' }).getAttribute('aria-selected')) === 'true',
    '随记标签处于选中状态'
  )
  check((await page.locator('.note').count()) === 4, '随记列表加载成功')
  check(
    JSON.stringify(await noteTitles()) ===
      JSON.stringify([
        '关于新版本导航的想法',
        '周末想去的咖啡馆',
        '给随记加关键词',
        '一个很轻的念头'
      ]),
    '随记沿用待办的优先级排序'
  )
  check(
    JSON.stringify(await page.locator('.note__keywords').allTextContents()) ===
      JSON.stringify(['导航 · 交互 · 克制', '周末 · 咖啡馆']),
    '关键词跟在标题后显示'
  )
  check((await page.locator('.task__note').count()) === 4, '随记默认展开详情')
  check(
    (await page.locator('.note .task__note').first().innerText()).includes('滑块的切换方式'),
    '默认展开状态直接显示正文'
  )

  const firstNote = page.locator('.note', { hasText: '关于新版本导航的想法' })
  check(
    (await firstNote.getByRole('button', { name: '编辑关键词' }).count()) === 1 &&
      (await firstNote.getByRole('button', { name: '生成关键词' }).count()) === 0,
    '已有关键词的随记显示「编辑关键词」'
  )

  await firstNote.getByRole('button', { name: '编辑关键词' }).click()
  await page.locator('.note-keywords-editor__input').waitFor({ state: 'visible' })
  await page.locator('.note-keywords-editor__input').fill('导航、信息架构、节奏')
  await page.locator('.note-keywords-editor__save').click()
  await page.waitForTimeout(350)
  check(
    (await firstNote.locator('.note__keywords').innerText()).includes('信息架构'),
    '可以手动编辑关键词'
  )
  check(
    (await page.locator('.note-keyword-action').allTextContents()).every(
      (text) => !text.includes('重新生成')
    ),
    '不再展示重新生成关键词'
  )

  await firstNote.locator('.note__content').dblclick({ position: { x: 26, y: 8 } })
  await page.locator('.note-editor').waitFor({ state: 'visible' })
  check((await page.locator('.note--editing').count()) === 1, '双击正文后在原位置进入编辑')
  check((await page.locator('.composer').count()) === 0, '编辑随记不会在顶部再生成一个面板')
  const caretPosition = await page
    .locator('.note-editor__content')
    .evaluate((element) => element.selectionStart)
  check(caretPosition > 0, '双击正文后光标落在对应位置')
  await page.locator('.note-editor').getByRole('button', { name: '取消', exact: true }).click()
  await page.waitForTimeout(300)

  await firstNote.locator('.task__summary').click()
  await page.waitForTimeout(250)
  check((await firstNote.locator('.task__note').count()) === 0, '点击标题可以收起随记')
  await firstNote.locator('.task__summary').click()
  await page.waitForTimeout(250)

  const noKeyNote = page.locator('.note', { hasText: '给随记加关键词' })
  await noKeyNote.getByRole('button', { name: '生成关键词' }).click()
  await page.locator('.toast').waitFor({ state: 'visible', timeout: 3000 })
  check(
    (await page.locator('.toast').innerText()).includes('DeepSeek API Key'),
    '未配置 Key 时提示先配置 DeepSeek'
  )
  await page.locator('.toast__close').click()

  await page.locator('.add-button').click()
  await page.locator('.composer').waitFor({ state: 'visible' })
  check(
    (await page.locator('.composer__label').innerText()) === '新建随记',
    '随记视图的加号打开随记面板'
  )
  await page.getByLabel('随记标题').fill('一条刚刚写下的随记')
  await page.getByLabel('随记内容').fill('随风记下来的测试正文。')
  await page.locator('.flag-toggle--urgent').click()
  await page.locator('.composer__submit').click()
  await page.locator('.composer').waitFor({ state: 'hidden' })
  await page.waitForTimeout(500)
  check((await page.locator('.note').count()) === 5, '可以新增随记')
  check(
    JSON.stringify(await noteTitles()) ===
      JSON.stringify([
        '关于新版本导航的想法',
        '周末想去的咖啡馆',
        '一条刚刚写下的随记',
        '给随记加关键词',
        '一个很轻的念头'
      ]),
    '新随记按标签和创建时间排序'
  )

  const created = page.locator('.note', { hasText: '一条刚刚写下的随记' })
  await created.getByRole('button', { name: '编辑' }).click()
  await page.locator('.note--editing').waitFor({ state: 'visible' })
  check((await page.locator('.composer').count()) === 0, '编辑随记不再出现顶部重复面板')
  const editor = page.locator('.note-editor')
  const heightBefore = await editor
    .locator('.note-editor__content')
    .evaluate((element) => element.getBoundingClientRect().height)
  await page.getByLabel('随记标题').fill('改过标题的随记')
  await page.getByLabel('随记内容').fill(
    Array.from({ length: 18 }, () => '这一行用来检查输入框随内容增长。').join('\n')
  )
  await page.waitForTimeout(300)
  const heightAfter = await editor
    .locator('.note-editor__content')
    .evaluate((element) =>
      Math.max(
        element.getBoundingClientRect().height,
        Number.parseFloat(element.style.height || '0')
      )
    )
  check(
    heightAfter > heightBefore && heightAfter >= 160,
    '编辑框会随内容增长并保留足够冗余'
  )
  await editor.getByRole('button', { name: '保存' }).click()
  await page.waitForTimeout(450)
  check((await noteTitles()).includes('改过标题的随记'), '随记可以在原位置编辑标题和正文')

  const edited = page.locator('.note', { hasText: '改过标题的随记' })
  const editedActions = edited.locator('.task__actions button')
  check((await editedActions.count()) === 3, '随记操作区保留三个按钮')
  check(
    (await edited.getByRole('button', { name: '删除', exact: true }).count()) === 0,
    '随记操作区不再显示删除按钮'
  )
  check((await editedActions.last().innerText()).trim() === '归档', '归档位于随记操作区最右侧')
  await edited.click({ button: 'right' })
  await page.locator('.context-menu').waitFor({ state: 'visible' })
  check(
    (await page.getByRole('menuitem', { name: '删除随记' }).count()) === 1,
    '删除仍保留在随记右键菜单'
  )
  await page.getByRole('menuitem', { name: '删除随记' }).click()
  await page.locator('.confirm-dialog').waitFor({ state: 'visible' })
  check(
    (await page.locator('.confirm-dialog').innerText()).includes('删除这条随记'),
    '删除随记前有二次确认'
  )
  await page.locator('.confirm-dialog .danger-button').click()
  await page.locator('.confirm-dialog').waitFor({ state: 'hidden' })
  await page.waitForTimeout(300)
  check((await page.locator('.note').count()) === 4, '确认后随记被删除')

  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'notes.json'), 'utf8'))
  check(
    persisted.notes.length === 4 && !persisted.notes.some((note) => note.title === '改过标题的随记'),
    '随记修改已持久化到 notes.json'
  )

  const today = new Date()
  const todayTitle = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`

  await page.locator('.add-button').click()
  await page.locator('.composer').waitFor({ state: 'visible' })
  check(
    (await page.getByLabel('随记标题').inputValue()) === '' &&
      (await page.getByLabel('随记标题').getAttribute('placeholder')) === todayTitle,
    '新建随记的标题默认显示暗色日期占位'
  )
  await page.getByLabel('随记内容').fill('只写正文，标题交给日期。')
  await page.locator('.composer__submit').click()
  await page.locator('.composer').waitFor({ state: 'hidden' })
  await page.waitForTimeout(450)
  const dateNote = page.locator('.note', { hasText: todayTitle })
  check((await dateNote.count()) === 1, '不填标题时自动使用日期作为标题')
  check(
    (await dateNote.locator('.note__title--auto').innerText()) === todayTitle,
    '自动日期标题使用更暗的样式'
  )
  await dateNote.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '删除随记' }).click()
  await page.locator('.confirm-dialog .danger-button').click()
  await page.locator('.confirm-dialog').waitFor({ state: 'hidden' })
  await page.waitForTimeout(250)

  const archiveNote = page.locator('.note', { hasText: '周末想去的咖啡馆' })
  await archiveNote.getByRole('button', { name: '归档' }).click()
  await page.waitForTimeout(350)
  check((await page.locator('.note').count()) === 3, '随记可以归档')
  if (await page.locator('.toast').count()) await page.locator('.toast__close').click()

  await page.getByRole('button', { name: '设置与归档' }).click()
  await page.locator('.settings-view').waitFor({ state: 'visible' })
  check((await page.locator('.archive-item').count()) === 0, '随记归档默认收起')
  await page.locator('.archive-toggle').click()
  await page.waitForTimeout(250)
  check(
    (await page.locator('.archive-item', { hasText: '周末想去的咖啡馆' }).count()) === 1,
    '设置页可以查看已归档随记'
  )
  await page.locator('.archive-item', { hasText: '周末想去的咖啡馆' })
    .getByRole('button', { name: /恢复/ })
    .click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '返回任务列表' }).click()
  await page.locator('.settings-view').waitFor({ state: 'hidden' })
  await page.waitForTimeout(300)
  check((await page.locator('.note').count()) === 4, '归档随记可以恢复')

  await page.getByRole('tab', { name: '待办' }).click()
  await page.waitForTimeout(300)
  check((await page.locator('.task .task__title').allTextContents()).includes('待办仍然正常工作'), '切回待办后任务仍在')

  await page.getByRole('button', { name: '设置与归档' }).click()
  await page.locator('.settings-view').waitFor({ state: 'visible' })
  check((await page.locator('.llm-key-block').count()) === 1, '设置账户区域有 AI 关键词配置')
  const bulkButton = page.getByRole('button', { name: '为没有关键词的随记生成关键词' })
  check((await bulkButton.isDisabled()), '未配置 Key 时批量生成按钮禁用')
  await page.getByLabel('DeepSeek API Key').fill('sk-test-1234567890abcdef')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForTimeout(900)
  check(
    (await page.locator('.llm-key-block').innerText()).includes('DeepSeek 已配置'),
    '可以保存 DeepSeek API Key'
  )
  check(
    (await page.getByLabel('DeepSeek API Key').inputValue()) === '••••••••••••',
    '已保存的 Key 用圆形点表示'
  )
  check(
    !(await page.locator('.llm-key-block').innerText()).includes('仅保存在本机安全存储中') &&
      !(await page.locator('.llm-key-block').innerText()).includes('清除 Key'),
    'Key 区域移除了说明文字和清除文字'
  )
  check(await bulkButton.isEnabled(), '配置 Key 后批量生成按钮可用')
  await page.getByLabel('DeepSeek API Key').focus()
  await page.waitForTimeout(150)
  check(
    (await page.getByLabel('DeepSeek API Key').inputValue()) === '',
    '聚焦输入框时清空遮罩，允许替换 Key'
  )
  await page.getByLabel('DeepSeek API Key').blur()
  await page.waitForTimeout(150)
  check(
    (await page.getByLabel('DeepSeek API Key').inputValue()) === '••••••••••••',
    '失焦后恢复圆形点遮罩'
  )

  check(pageErrors.length === 0, `随记流程无渲染错误${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`)

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
