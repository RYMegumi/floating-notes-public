import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { isLanguagePreference } from '../shared/i18n'
import type { AppSettings, Note, Task, ThemePreference, WindowPosition } from '../shared/types'

interface TaskFile {
  version: 1
  tasks: Task[]
}

interface NoteFile {
  version: 1
  notes: Note[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'system',
  alwaysOnTop: false,
  launchAtLogin: false,
  windowPosition: null
}

const THEMES: ThemePreference[] = ['system', 'light', 'dark']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  return Number.isFinite(Date.parse(value)) ? value : null
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n/g, '\n').trim().slice(0, maxLength)
}

function cleanTask(value: unknown): Task | null {
  if (!isRecord(value)) return null

  const id = typeof value.id === 'string' ? value.id.trim().slice(0, 80) : ''
  const title = cleanText(value.title, 300)
  const createdAt = validDate(value.createdAt)

  if (!id || !title || !createdAt) return null

  return {
    id,
    title,
    note: cleanText(value.note, 20_000),
    important: value.important === true,
    urgent: value.urgent === true,
    createdAt,
    updatedAt: validDate(value.updatedAt),
    archivedAt: validDate(value.archivedAt)
  }
}

function cleanKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const keyword = item.trim().replace(/^#+/, '').slice(0, 16)
    if (!keyword || seen.has(keyword)) continue
    seen.add(keyword)
    result.push(keyword)
    if (result.length >= 8) break
  }
  return result
}

function cleanNote(value: unknown): Note | null {
  if (!isRecord(value)) return null

  const id = typeof value.id === 'string' ? value.id.trim().slice(0, 80) : ''
  const title = cleanText(value.title, 300)
  const createdAt = validDate(value.createdAt)

  if (!id || !title || !createdAt) return null

  return {
    id,
    title,
    content: cleanText(value.content, 20_000),
    keywords: cleanKeywords(value.keywords),
    titleAuto:
      value.titleAuto === true ||
      (value.titleAuto === undefined && /^\d{8}$/.test(title)),
    important: value.important === true,
    urgent: value.urgent === true,
    createdAt,
    updatedAt: validDate(value.updatedAt),
    archivedAt: validDate(value.archivedAt)
  }
}

function cleanWindowPosition(value: unknown): WindowPosition | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null
  return { x: Math.round(value.x), y: Math.round(value.y) }
}

export function sanitizeSettings(value: unknown): AppSettings {
  const source = isRecord(value) ? value : {}
  return {
    theme:
      typeof source.theme === 'string' && THEMES.includes(source.theme as ThemePreference)
        ? (source.theme as ThemePreference)
        : DEFAULT_SETTINGS.theme,
    language: isLanguagePreference(source.language)
      ? source.language
      : DEFAULT_SETTINGS.language,
    alwaysOnTop:
      typeof source.alwaysOnTop === 'boolean'
        ? source.alwaysOnTop
        : DEFAULT_SETTINGS.alwaysOnTop,
    launchAtLogin:
      typeof source.launchAtLogin === 'boolean'
        ? source.launchAtLogin
        : DEFAULT_SETTINGS.launchAtLogin,
    windowPosition: cleanWindowPosition(source.windowPosition)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class LocalStore {
  private readonly tasksPath: string
  private readonly notesPath: string
  private readonly settingsPath: string
  private warnings: string[] = []

  constructor(private readonly dataDir: string) {
    this.tasksPath = join(dataDir, 'tasks.json')
    this.notesPath = join(dataDir, 'notes.json')
    this.settingsPath = join(dataDir, 'settings.json')
  }

  get path(): string {
    return this.dataDir
  }

  get loadWarnings(): string[] {
    return [...this.warnings]
  }

  load(): { tasks: Task[]; notes: Note[]; settings: AppSettings } {
    this.warnings = []
    this.ensureDir()

    const tasks = this.loadTasks()
    const notes = this.loadNotes()
    const settings = this.loadSettings()
    return { tasks, notes, settings }
  }

  saveTasks(tasks: Task[]): void {
    this.ensureDir()
    const file: TaskFile = {
      version: 1,
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        note: task.note,
        important: task.important,
        urgent: task.urgent,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        archivedAt: task.archivedAt
      }))
    }
    this.writeJson(this.tasksPath, file)
  }

  saveNotes(notes: Note[]): void {
    this.ensureDir()
    const file: NoteFile = {
      version: 1,
      notes: notes.map((note) => ({
        id: note.id,
        title: note.title,
        content: note.content,
        keywords: [...note.keywords],
        titleAuto: note.titleAuto === true,
        important: note.important,
        urgent: note.urgent,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        archivedAt: note.archivedAt
      }))
    }
    this.writeJson(this.notesPath, file)
  }

  saveSettings(settings: AppSettings): void {
    this.ensureDir()
    this.writeJson(this.settingsPath, settings)
  }

  private ensureDir(): void {
    mkdirSync(this.dataDir, { recursive: true })
  }

  private loadTasks(): Task[] {
    const loaded = this.readJsonWithBackup(this.tasksPath, '任务')
    if (loaded === null) return []
    if (!isRecord(loaded) || !Array.isArray(loaded.tasks)) {
      this.warn('任务数据格式不正确，已暂时使用空列表。')
      this.quarantine(this.tasksPath)
      return []
    }

    const seen = new Set<string>()
    const tasks: Task[] = []
    let skipped = 0

    for (const value of loaded.tasks) {
      const task = cleanTask(value)
      if (!task || seen.has(task.id)) {
        skipped += 1
        continue
      }
      seen.add(task.id)
      tasks.push(task)
    }

    if (skipped > 0) {
      this.warn(`有 ${skipped} 条任务数据无法读取，已跳过；原始文件仍保留在备份目录。`)
    }

    return tasks
  }

  private loadNotes(): Note[] {
    const loaded = this.readJsonWithBackup(this.notesPath, '随记')
    if (loaded === null) return []
    if (!isRecord(loaded) || !Array.isArray(loaded.notes)) {
      this.warn('随记数据格式不正确，已暂时使用空列表。')
      this.quarantine(this.notesPath)
      return []
    }

    const seen = new Set<string>()
    const notes: Note[] = []
    let skipped = 0

    for (const value of loaded.notes) {
      const note = cleanNote(value)
      if (!note || seen.has(note.id)) {
        skipped += 1
        continue
      }
      seen.add(note.id)
      notes.push(note)
    }

    if (skipped > 0) {
      this.warn(`有 ${skipped} 条随记数据无法读取，已跳过；原始文件仍保留在备份目录。`)
    }

    return notes
  }

  private loadSettings(): AppSettings {
    const loaded = this.readJsonWithBackup(this.settingsPath, '设置')
    if (loaded === null) return { ...DEFAULT_SETTINGS }
    if (!isRecord(loaded)) {
      this.warn('设置数据格式不正确，已恢复默认设置。')
      this.quarantine(this.settingsPath)
      return { ...DEFAULT_SETTINGS }
    }
    return sanitizeSettings(loaded)
  }

  private readJsonWithBackup(path: string, label: string): unknown | null {
    const backupPath = `${path}.bak`

    if (!existsSync(path)) {
      if (!existsSync(backupPath)) return null
      const fromBackup = this.tryRead(backupPath)
      if (fromBackup.ok) {
        this.warn(`${label}数据缺失，已从备份恢复。`)
        return fromBackup.value
      }
      return null
    }

    const primary = this.tryRead(path)
    if (primary.ok) return primary.value

    this.warn(`${label}数据读取失败，已尝试从备份恢复。`)
    this.quarantine(path)

    if (existsSync(backupPath)) {
      const backup = this.tryRead(backupPath)
      if (backup.ok) {
        this.warn(`${label}数据已从备份恢复。`)
        return backup.value
      }
    }

    this.warn(`${label}数据备份也无法读取，请查看数据文件夹中的 .corrupt 文件。`)
    return null
  }

  private tryRead(path: string): { ok: true; value: unknown } | { ok: false } {
    try {
      return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) as unknown }
    } catch {
      return { ok: false }
    }
  }

  private quarantine(path: string): void {
    if (!existsSync(path)) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    try {
      renameSync(path, `${path}.corrupt-${stamp}`)
    } catch {
      // A failed quarantine must never make the app unusable. The original stays where it was.
    }
  }

  private writeJson(path: string, value: unknown): void {
    const dir = dirname(path)
    mkdirSync(dir, { recursive: true })
    const tmp = join(dir, `.${basename(path)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
    const backupPath = `${path}.bak`

    try {
      writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
      if (existsSync(path)) {
        try {
          copyFileSync(path, backupPath)
        } catch {
          // The backup is best-effort; the atomic replacement below is the primary safeguard.
        }
      }
      renameSync(tmp, path)
    } catch (error) {
      try {
        if (existsSync(tmp)) unlinkSync(tmp)
      } catch {
        // Ignore cleanup failures.
      }
      throw new Error(`无法写入数据文件：${errorMessage(error)}`)
    }
  }

  private warn(message: string): void {
    if (!this.warnings.includes(message)) this.warnings.push(message)
  }
}
