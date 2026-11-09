import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AccountActionResult,
  AccountState,
  AppSettings,
  BootstrapData,
  BulkKeywordsResult,
  FujianApi,
  Note,
  NoteKeywordsResult,
  SaveNotesResult,
  SaveTasksResult,
  SettingsChangedPayload,
  SettingsResult,
  Task,
  ThemeInfo
} from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: FujianApi = {
  getBootstrap: () => ipcRenderer.invoke('app:bootstrap') as Promise<BootstrapData>,
  saveTasks: (tasks: Task[]) =>
    ipcRenderer.invoke('tasks:save', tasks) as Promise<SaveTasksResult>,
  saveNotes: (notes: Note[]) =>
    ipcRenderer.invoke('notes:save', notes) as Promise<SaveNotesResult>,
  updateSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke('settings:update', patch) as Promise<SettingsResult>,
  resizeWindow: (height: number) => {
    ipcRenderer.send('window:resize', height)
  },
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder') as Promise<void>,
  quit: () => {
    ipcRenderer.send('app:quit')
  },
  getAccountState: () => ipcRenderer.invoke('account:get-state') as Promise<AccountState>,
  requestLoginCode: (email: string) =>
    ipcRenderer.invoke('account:request-code', email) as Promise<AccountActionResult>,
  verifyLoginCode: (email: string, code: string) =>
    ipcRenderer.invoke('account:verify-code', email, code) as Promise<AccountActionResult>,
  signOut: () => ipcRenderer.invoke('account:sign-out') as Promise<void>,
  syncNow: () => ipcRenderer.invoke('sync:now') as Promise<AccountActionResult>,
  setLlmKey: (key: string) =>
    ipcRenderer.invoke('llm:set-key', key) as Promise<AccountActionResult>,
  clearLlmKey: () => ipcRenderer.invoke('llm:clear-key') as Promise<AccountActionResult>,
  generateNoteKeywords: (noteId: string) =>
    ipcRenderer.invoke('notes:generate-keywords', noteId) as Promise<NoteKeywordsResult>,
  generateAllNoteKeywords: () =>
    ipcRenderer.invoke('notes:generate-all-keywords') as Promise<BulkKeywordsResult>,
  onThemeChanged: (listener: (theme: ThemeInfo) => void) =>
    subscribe<ThemeInfo>('theme:changed', listener),
  onSettingsChanged: (listener: (payload: SettingsChangedPayload) => void) =>
    subscribe<SettingsChangedPayload>('settings:changed', listener),
  onAccountChanged: (listener: (state: AccountState) => void) =>
    subscribe<AccountState>('account:changed', listener),
  onTasksChanged: (listener: (tasks: Task[]) => void) =>
    subscribe<Task[]>('tasks:changed', listener),
  onNotesChanged: (listener: (notes: Note[]) => void) =>
    subscribe<Note[]>('notes:changed', listener),
  onOpenSettings: (listener: () => void) => subscribe<void>('ui:open-settings', listener),
  onNewTask: (listener: () => void) => subscribe<void>('ui:new-task', listener),
  onNewNote: (listener: () => void) => subscribe<void>('ui:new-note', listener)
}

contextBridge.exposeInMainWorld('fujian', api)
