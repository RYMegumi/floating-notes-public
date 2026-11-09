import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { net, safeStorage } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AccountActionResult,
  AccountState,
  AccountUser,
  Note,
  Task
} from '../shared/types'

interface AccountServiceOptions {
  dataDir: string
  getTasks: () => Task[]
  setTasks: (tasks: Task[]) => void
  getNotes: () => Note[]
  setNotes: (notes: Note[]) => void
  onStateChanged: (state: AccountState) => void
}

interface CloudTaskRow {
  id: string
  title: string
  note: string | null
  important: boolean
  urgent: boolean
  created_at: string
  updated_at: string
  archived_at: string | null
  deleted_at: string | null
}

interface CloudNoteRow {
  id: string
  title: string
  content: string | null
  keywords: string[] | null
  title_auto: boolean
  important: boolean
  urgent: boolean
  created_at: string
  updated_at: string
  archived_at: string | null
  deleted_at: string | null
}

interface StoredSyncState {
  pendingDeletions: string[]
  pendingNoteDeletions?: string[]
  lastSyncedAt: string | null
}

const AUTH_FILE = 'cloud-auth.bin'
const SYNC_STATE_FILE = 'cloud-sync.json'
const OTP_TYPES = ['email', 'signup', 'magiclink'] as const

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function taskTimestamp(task: Task): number {
  return parseTimestamp(task.updatedAt ?? task.createdAt)
}

function sameTask(a: Task, b: Task): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function toRow(task: Task): Omit<CloudTaskRow, 'updated_at' | 'deleted_at' | 'user_id'> {
  return {
    id: task.id,
    title: task.title,
    note: task.note,
    important: task.important,
    urgent: task.urgent,
    created_at: task.createdAt,
    archived_at: task.archivedAt
  }
}

function fromRow(row: CloudTaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    note: row.note ?? '',
    important: row.important === true,
    urgent: row.urgent === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at
  }
}

function noteTimestamp(note: Note): number {
  return parseTimestamp(note.updatedAt ?? note.createdAt)
}

function sameNote(a: Note, b: Note): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function toNoteRow(
  note: Note
): Omit<CloudNoteRow, 'updated_at' | 'deleted_at' | 'user_id'> {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    keywords: note.keywords,
    title_auto: note.titleAuto === true,
    important: note.important,
    urgent: note.urgent,
    created_at: note.createdAt,
    archived_at: note.archivedAt
  }
}

function fromNoteRow(row: CloudNoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content ?? '',
    keywords: Array.isArray(row.keywords) ? row.keywords.filter((item) => typeof item === 'string') : [],
    titleAuto: row.title_auto === true,
    important: row.important === true,
    urgent: row.urgent === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at
  }
}

class EncryptedAuthStorage {
  private values: Record<string, string> = {}
  private encryptionAvailable = false

  constructor(private readonly file: string) {
    this.encryptionAvailable = safeStorage.isEncryptionAvailable()
    this.load()
  }

  getItem(key: string): string | null {
    return this.values[key] ?? null
  }

  setItem(key: string, value: string): void {
    this.values[key] = value
    this.persist()
  }

  removeItem(key: string): void {
    delete this.values[key]
    this.persist()
  }

  clear(): void {
    this.values = {}
    this.persist()
  }

  private load(): void {
    if (!this.encryptionAvailable || !existsSync(this.file)) return
    try {
      const decrypted = safeStorage.decryptString(readFileSync(this.file))
      const parsed = JSON.parse(decrypted) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.values = Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      }
    } catch {
      try {
        unlinkSync(this.file)
      } catch {
        // Ignore a failed cleanup; a new session can still be written.
      }
    }
  }

  private persist(): void {
    if (!this.encryptionAvailable) return
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      if (Object.keys(this.values).length === 0) {
        if (existsSync(this.file)) unlinkSync(this.file)
        return
      }
      const encrypted = safeStorage.encryptString(JSON.stringify(this.values))
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, encrypted)
      renameSync(tmp, this.file)
    } catch {
      // Persistence is best-effort. The in-memory session still works.
    }
  }
}

export class AccountService {
  private readonly client: SupabaseClient | null
  private readonly authStorage: EncryptedAuthStorage
  private readonly syncStatePath: string
  private readonly options: AccountServiceOptions
  private user: AccountUser | null = null
  private syncStatus: 'idle' | 'syncing' | 'error' = 'idle'
  private syncError: string | undefined
  private lastSyncedAt: string | null = null
  private pendingDeletions = new Set<string>()
  private dirtyIds = new Set<string>()
  private pendingNoteDeletions = new Set<string>()
  private dirtyNoteIds = new Set<string>()
  private syncTimer: NodeJS.Timeout | null = null
  private syncPromise: Promise<AccountActionResult> | null = null
  private authSubscription: { unsubscribe: () => void } | null = null
  private disposed = false

  constructor(options: AccountServiceOptions) {
    this.options = options
    this.syncStatePath = join(options.dataDir, SYNC_STATE_FILE)
    this.authStorage = new EncryptedAuthStorage(join(options.dataDir, AUTH_FILE))
    this.readSyncState()

    const url = __FUJIAN_SUPABASE_URL__.trim()
    const key = __FUJIAN_SUPABASE_PUBLISHABLE_KEY__.trim()
    this.client =
      url && key
        ? createClient(url, key, {
            global: {
              fetch: (input, init) =>
                net.fetch(
                  input as Parameters<typeof net.fetch>[0],
                  init as Parameters<typeof net.fetch>[1]
                )
            },
            auth: {
              storage: this.authStorage,
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: false
            }
          })
        : null
  }

  get configured(): boolean {
    return this.client !== null
  }

  getState(): AccountState {
    return {
      configured: this.configured,
      user: this.user ? { ...this.user } : null,
      sync: {
        status: this.syncStatus,
        lastSyncedAt: this.lastSyncedAt,
        ...(this.syncError ? { error: this.syncError } : {})
      }
    }
  }

  async initialize(): Promise<void> {
    if (!this.client) return
    this.authSubscription = this.client.auth.onAuthStateChange((_event, session) => {
      this.applySession(session)
    }).data.subscription

    try {
      const { data } = await this.client.auth.getSession()
      this.applySession(data.session)
    } catch {
      // Offline startup is fine; the local app remains usable.
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
    this.authSubscription?.unsubscribe()
    this.authSubscription = null
  }

  taskLocalSave(previous: Task[], next: Task[]): void {
    const previousMap = new Map(previous.map((task) => [task.id, task]))
    const nextIds = new Set(next.map((task) => task.id))

    for (const task of previous) {
      if (!nextIds.has(task.id)) this.pendingDeletions.add(task.id)
    }
    for (const task of next) {
      const old = previousMap.get(task.id)
      if (!old || !sameTask(old, task)) this.dirtyIds.add(task.id)
    }

    this.persistSyncState()
    if (this.user) this.scheduleSync(900)
  }

  notesLocalSave(previous: Note[], next: Note[]): void {
    const previousMap = new Map(previous.map((note) => [note.id, note]))
    const nextIds = new Set(next.map((note) => note.id))

    for (const note of previous) {
      if (!nextIds.has(note.id)) this.pendingNoteDeletions.add(note.id)
    }
    for (const note of next) {
      const old = previousMap.get(note.id)
      if (!old || !sameNote(old, note)) this.dirtyNoteIds.add(note.id)
    }

    this.persistSyncState()
    if (this.user) this.scheduleSync(900)
  }

  scheduleSync(delay = 1200): void {
    if (!this.client || !this.user || this.disposed) return
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null
      void this.syncNow()
    }, delay)
  }

  async requestLoginCode(email: string): Promise<AccountActionResult> {
    if (!this.client) return { ok: false, error: '账号服务未配置。' }
    const address = normalizeEmail(email)
    if (!isEmail(address)) return { ok: false, error: '请输入有效的邮箱地址。' }

    const { error } = await this.client.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true }
    })
    if (error) return { ok: false, error: this.authError(error.message) }
    return { ok: true }
  }

  async verifyLoginCode(email: string, code: string): Promise<AccountActionResult> {
    if (!this.client) return { ok: false, error: '账号服务未配置。' }
    const address = normalizeEmail(email)
    const token = code.replace(/\s+/g, '')
    if (!isEmail(address)) return { ok: false, error: '请输入有效的邮箱地址。' }
    if (!/^\d{4,10}$/.test(token)) return { ok: false, error: '请输入邮件中的数字验证码。' }

    let lastMessage = '验证码无效或已过期，请重新获取。'
    for (const type of OTP_TYPES) {
      const { data, error } = await this.client.auth.verifyOtp({
        email: address,
        token,
        type
      })
      if (!error) {
        this.applySession(data.session)
        if (data.session) this.scheduleSync(0)
        return { ok: true }
      }
      lastMessage = this.authError(error.message)
    }
    return { ok: false, error: lastMessage }
  }

  async signOut(): Promise<void> {
    if (!this.client) return
    this.cancelScheduledSync()
    const { error } = await this.client.auth.signOut()
    if (error) throw new Error(this.authError(error.message))
    this.applySession(null)
  }

  async syncNow(): Promise<AccountActionResult> {
    if (!this.client) return { ok: false, error: '账号服务未配置。' }
    if (!this.user) return { ok: false, error: '请先登录。' }
    if (this.syncPromise) return this.syncPromise

    this.syncPromise = this.doSync().finally(() => {
      this.syncPromise = null
    })
    return this.syncPromise
  }

  private async doSync(): Promise<AccountActionResult> {
    if (!this.client) return { ok: false, error: '账号服务未配置。' }
    this.setSyncState('syncing')
    try {
      const firstRows = await this.fetchCloudRows()
      const local = this.options.getTasks()
      const deletedInCloud = new Set(
        firstRows.filter((row) => row.deleted_at).map((row) => row.id)
      )
      const cloudMap = new Map(
        firstRows
          .filter((row) => !row.deleted_at)
          .map((row) => [row.id, fromRow(row)])
      )
      const merged = new Map(local.map((task) => [task.id, { ...task }]))

      for (const id of deletedInCloud) merged.delete(id)

      for (const cloudTask of cloudMap.values()) {
        if (this.pendingDeletions.has(cloudTask.id)) continue
        const localTask = merged.get(cloudTask.id)
        if (!localTask) {
          merged.set(cloudTask.id, cloudTask)
          continue
        }
        if (parseTimestamp(cloudTask.updatedAt) > taskTimestamp(localTask)) {
          merged.set(cloudTask.id, cloudTask)
        }
      }

      const uploads: Task[] = []
      for (const task of merged.values()) {
        if (this.pendingDeletions.has(task.id)) continue
        const cloudTask = cloudMap.get(task.id)
        const localIsNewer =
          taskTimestamp(task) > parseTimestamp(cloudTask?.updatedAt)
        const dirtyAtSameTime =
          this.dirtyIds.has(task.id) &&
          taskTimestamp(task) >= parseTimestamp(cloudTask?.updatedAt)
        if (!cloudTask || localIsNewer || dirtyAtSameTime) uploads.push(task)
      }

      if (this.pendingDeletions.size > 0) {
        const ids = [...this.pendingDeletions]
        const { error } = await this.client
          .from('tasks')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', ids)
        if (error) throw new Error(this.dataError(error.message))
        for (const id of ids) this.pendingDeletions.delete(id)
        this.persistSyncState()
      }

      if (uploads.length > 0) {
        const { error } = await this.client
          .from('tasks')
          .upsert(uploads.map(toRow), { onConflict: 'id' })
        if (error) throw new Error(this.dataError(error.message))
        for (const task of uploads) this.dirtyIds.delete(task.id)
      }

      const canonical = (await this.fetchCloudRows())
        .filter((row) => !row.deleted_at)
        .map(fromRow)
      const next = canonical.map((task) => ({ ...task }))
      const changed =
        next.length !== local.length ||
        next.some((task) => {
          const existing = local.find((item) => item.id === task.id)
          return !existing || !sameTask(existing, task)
        })

      if (changed) this.options.setTasks(next)

      await this.syncNotesInternal()

      this.dirtyIds.clear()
      this.dirtyNoteIds.clear()
      this.lastSyncedAt = new Date().toISOString()
      this.setSyncState('idle')
      this.persistSyncState()
      return { ok: true }
    } catch (error) {
      const message = messageOf(error)
      this.setSyncState('error', this.dataError(message))
      return { ok: false, error: this.dataError(message) }
    }
  }

  private async syncNotesInternal(): Promise<void> {
    if (!this.client) return
    const firstRows = await this.fetchCloudNoteRows()
    const local = this.options.getNotes()
    const deletedInCloud = new Set(
      firstRows.filter((row) => row.deleted_at).map((row) => row.id)
    )
    const cloudMap = new Map(
      firstRows
        .filter((row) => !row.deleted_at)
        .map((row) => [row.id, fromNoteRow(row)])
    )
    const merged = new Map(local.map((note) => [note.id, { ...note }]))

    for (const id of deletedInCloud) merged.delete(id)

    for (const cloudNote of cloudMap.values()) {
      if (this.pendingNoteDeletions.has(cloudNote.id)) continue
      const localNote = merged.get(cloudNote.id)
      if (!localNote) {
        merged.set(cloudNote.id, cloudNote)
        continue
      }
      if (parseTimestamp(cloudNote.updatedAt) > noteTimestamp(localNote)) {
        merged.set(cloudNote.id, cloudNote)
      }
    }

    const uploads: Note[] = []
    for (const note of merged.values()) {
      if (this.pendingNoteDeletions.has(note.id)) continue
      const cloudNote = cloudMap.get(note.id)
      const localIsNewer =
        noteTimestamp(note) > parseTimestamp(cloudNote?.updatedAt)
      const dirtyAtSameTime =
        this.dirtyNoteIds.has(note.id) &&
        noteTimestamp(note) >= parseTimestamp(cloudNote?.updatedAt)
      if (!cloudNote || localIsNewer || dirtyAtSameTime) uploads.push(note)
    }

    if (this.pendingNoteDeletions.size > 0) {
      const ids = [...this.pendingNoteDeletions]
      const { error } = await this.client
        .from('notes')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw new Error(this.dataError(error.message))
      for (const id of ids) this.pendingNoteDeletions.delete(id)
      this.persistSyncState()
    }

    if (uploads.length > 0) {
      const { error } = await this.client
        .from('notes')
        .upsert(uploads.map(toNoteRow), { onConflict: 'id' })
      if (error) throw new Error(this.dataError(error.message))
      for (const note of uploads) this.dirtyNoteIds.delete(note.id)
    }

    const canonical = (await this.fetchCloudNoteRows())
      .filter((row) => !row.deleted_at)
      .map(fromNoteRow)
    const next = canonical.map((note) => ({ ...note }))
    const changed =
      next.length !== local.length ||
      next.some((note) => {
        const existing = local.find((item) => item.id === note.id)
        return !existing || !sameNote(existing, note)
      })

    if (changed) this.options.setNotes(next)
  }

  private async fetchCloudRows(): Promise<CloudTaskRow[]> {
    if (!this.client) return []
    const { data, error } = await this.client
      .from('tasks')
      .select('id,title,note,important,urgent,created_at,updated_at,archived_at,deleted_at')
      .order('updated_at', { ascending: true })
    if (error) throw new Error(this.dataError(error.message))
    return Array.isArray(data) ? (data as CloudTaskRow[]) : []
  }

  private async fetchCloudNoteRows(): Promise<CloudNoteRow[]> {
    if (!this.client) return []
    const { data, error } = await this.client
      .from('notes')
      .select(
        'id,title,content,keywords,title_auto,important,urgent,created_at,updated_at,archived_at,deleted_at'
      )
      .order('updated_at', { ascending: true })
    if (error) throw new Error(this.dataError(error.message))
    return Array.isArray(data) ? (data as CloudNoteRow[]) : []
  }

  private applySession(session: Session | null): void {
    const nextUser: AccountUser | null = session?.user
      ? {
          id: session.user.id,
          email: session.user.email ?? ''
        }
      : null

    const wasSignedIn = Boolean(this.user)
    const changed =
      this.user?.id !== nextUser?.id || this.user?.email !== nextUser?.email
    this.user = nextUser

    if (!nextUser) {
      this.cancelScheduledSync()
      this.syncStatus = 'idle'
      this.syncError = undefined
    }

    if (changed) this.emit()
    if (nextUser && !wasSignedIn) this.scheduleSync(0)
  }

  private setSyncState(status: 'idle' | 'syncing' | 'error', error?: string): void {
    this.syncStatus = status
    this.syncError = status === 'error' ? error : undefined
    this.emit()
  }

  private emit(): void {
    if (!this.disposed) this.options.onStateChanged(this.getState())
  }

  private cancelScheduledSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
  }

  private readSyncState(): void {
    try {
      if (!existsSync(this.syncStatePath)) return
      const parsed = JSON.parse(readFileSync(this.syncStatePath, 'utf8')) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
      const state = parsed as Partial<StoredSyncState>
      if (Array.isArray(state.pendingDeletions)) {
        this.pendingDeletions = new Set(
          state.pendingDeletions.filter((id): id is string => typeof id === 'string')
        )
      }
      if (Array.isArray(state.pendingNoteDeletions)) {
        this.pendingNoteDeletions = new Set(
          state.pendingNoteDeletions.filter((id): id is string => typeof id === 'string')
        )
      }
      if (typeof state.lastSyncedAt === 'string') this.lastSyncedAt = state.lastSyncedAt
    } catch {
      // A corrupt sync-aid file must not block the app.
    }
  }

  private persistSyncState(): void {
    try {
      mkdirSync(this.options.dataDir, { recursive: true })
      const value: StoredSyncState = {
        pendingDeletions: [...this.pendingDeletions],
        pendingNoteDeletions: [...this.pendingNoteDeletions],
        lastSyncedAt: this.lastSyncedAt
      }
      const tmp = `${this.syncStatePath}.tmp`
      writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
      renameSync(tmp, this.syncStatePath)
    } catch {
      // Pending sync aids are best-effort; the task files remain the source of truth.
    }
  }

  private authError(message: string): string {
    const lower = message.toLowerCase()
    if (lower.includes('rate') || lower.includes('too many')) {
      return '发送太频繁，请稍后再试。'
    }
    if (lower.includes('expired')) return '验证码已过期，请重新获取。'
    if (lower.includes('invalid') || lower.includes('token')) {
      return '验证码无效，请检查后重试。'
    }
    if (lower.includes('fetch') || lower.includes('network')) {
      return '网络连接失败，请检查网络后重试。'
    }
    return message
  }

  private dataError(message: string): string {
    if (message.toLowerCase().includes('fetch')) return '网络连接失败，请稍后重试。'
    if (message.toLowerCase().includes('row-level security')) {
      return '没有权限读写这个账号的数据。'
    }
    return message
  }
}
