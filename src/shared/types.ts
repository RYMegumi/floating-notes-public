import type { Language, LanguagePreference } from './i18n'

export type ThemePreference = 'system' | 'light' | 'dark'

export type AppPlatform = 'darwin' | 'win32' | 'linux'

export interface Task {
  id: string
  title: string
  note: string
  important: boolean
  urgent: boolean
  createdAt: string
  updatedAt: string | null
  archivedAt: string | null
}

export interface Note {
  id: string
  title: string
  content: string
  keywords: string[]
  titleAuto?: boolean
  important: boolean
  urgent: boolean
  createdAt: string
  updatedAt: string | null
  archivedAt: string | null
}

export interface WindowPosition {
  x: number
  y: number
}

export interface AppSettings {
  theme: ThemePreference
  language: LanguagePreference
  alwaysOnTop: boolean
  launchAtLogin: boolean
  windowPosition: WindowPosition | null
}

export interface ThemeInfo {
  dark: boolean
  accent: string
  onAccent: string
}

export interface AccountUser {
  id: string
  email: string
}

export interface AccountSyncState {
  status: 'idle' | 'syncing' | 'error'
  lastSyncedAt: string | null
  error?: string
}

export interface AccountState {
  configured: boolean
  user: AccountUser | null
  sync: AccountSyncState
}

export interface AccountActionResult {
  ok: boolean
  error?: string
}

export interface BootstrapData {
  platform: AppPlatform
  tasks: Task[]
  notes: Note[]
  settings: AppSettings
  theme: ThemeInfo
  version: string
  language: Language
  materialSupported: boolean
  material: 'acrylic' | 'vibrancy' | 'solid'
  autoStartSupported: boolean
  autoStartEnabled: boolean
  dataDir: string
  account: AccountState
  llmConfigured: boolean
  warnings: string[]
}

export interface SaveTasksResult {
  ok: boolean
  error?: string
}

export type SaveNotesResult = SaveTasksResult

export interface NoteKeywordsResult {
  ok: boolean
  keywords?: string[]
  error?: string
}

export interface BulkKeywordsResult {
  ok: boolean
  total?: number
  generated?: number
  failed?: number
  error?: string
}

export interface SettingsResult {
  settings: AppSettings
  theme: ThemeInfo
  language: Language
  autoStartEnabled: boolean
  error?: string
}

export interface SettingsChangedPayload extends SettingsResult {
  source: 'renderer' | 'tray' | 'main'
}

export interface FujianApi {
  getBootstrap: () => Promise<BootstrapData>
  saveTasks: (tasks: Task[]) => Promise<SaveTasksResult>
  saveNotes: (notes: Note[]) => Promise<SaveNotesResult>
  updateSettings: (patch: Partial<AppSettings>) => Promise<SettingsResult>
  resizeWindow: (height: number) => void
  openDataFolder: () => Promise<void>
  quit: () => void
  getAccountState: () => Promise<AccountState>
  requestLoginCode: (email: string) => Promise<AccountActionResult>
  verifyLoginCode: (email: string, code: string) => Promise<AccountActionResult>
  signOut: () => Promise<void>
  syncNow: () => Promise<AccountActionResult>
  setLlmKey: (key: string) => Promise<AccountActionResult>
  clearLlmKey: () => Promise<AccountActionResult>
  generateNoteKeywords: (noteId: string) => Promise<NoteKeywordsResult>
  generateAllNoteKeywords: () => Promise<BulkKeywordsResult>
  onThemeChanged: (listener: (theme: ThemeInfo) => void) => () => void
  onSettingsChanged: (listener: (payload: SettingsChangedPayload) => void) => () => void
  onAccountChanged: (listener: (state: AccountState) => void) => () => void
  onTasksChanged: (listener: (tasks: Task[]) => void) => () => void
  onNotesChanged: (listener: (notes: Note[]) => void) => () => void
  onOpenSettings: (listener: () => void) => () => void
  onNewTask: (listener: () => void) => () => void
  onNewNote: (listener: () => void) => () => void
}
