import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { CircleAlert, RefreshCw, X } from 'lucide-react'
import { translate, type Language } from '@shared/i18n'
import type {
  AccountActionResult,
  AccountState,
  AppPlatform,
  AppSettings,
  Note,
  Task,
  ThemeInfo,
  ThemePreference
} from '@shared/types'
import { sortActiveNotes, sortActiveTasks, sortArchivedNotes, sortArchivedTasks } from '@shared/sort'
import { TopBar } from './components/TopBar'
import { ViewSwitch, type MainTab } from './components/ViewSwitch'
import { Composer, type ComposerDraft } from './components/Composer'
import type { NoteEditDraft } from './components/NoteInlineEditor'
import { TaskItem } from './components/TaskItem'
import { NoteItem } from './components/NoteItem'
import { EmptyState } from './components/EmptyState'
import { FocusBanner } from './components/FocusBanner'
import { TaskContextMenu } from './components/TaskContextMenu'
import { NoteContextMenu } from './components/NoteContextMenu'
import { SettingsView } from './components/SettingsView'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Toast, type ToastMessage } from './components/Toast'
import { I18nProvider } from './i18n'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'system',
  alwaysOnTop: false,
  launchAtLogin: false,
  windowPosition: null
}

interface AppMeta {
  platform: AppPlatform
  dataDir: string
  autoStartSupported: boolean
  materialSupported: boolean
}

type ComposerState =
  | { kind: 'task'; mode: 'create' }
  | { kind: 'task'; mode: 'edit'; taskId: string }
  | { kind: 'note'; mode: 'create' }
interface NoteEditState {
  noteId: string
  focus: 'title' | 'content'
  caret?: number
}
type AppView = 'tasks' | 'settings'
type PendingSetting = 'theme' | 'language' | 'alwaysOnTop' | 'launchAtLogin' | null
type DeleteTarget = { kind: 'task'; task: Task } | { kind: 'note'; note: Note }

interface ContextMenuState {
  kind: 'task' | 'note'
  id: string
  x: number
  y: number
}

function makeId(prefix: 'task' | 'note'): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function App() {
  const [loading, setLoading] = useState(true)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [language, setLanguage] = useState<Language>('zh-CN')
  const [tasks, setTasks] = useState<Task[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [theme, setTheme] = useState<ThemeInfo>(() => ({
    dark: window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
    accent: '#5b8def',
    onAccent: '#ffffff'
  }))
  const [autoStartEnabled, setAutoStartEnabled] = useState(false)
  const [account, setAccount] = useState<AccountState>({
    configured: false,
    user: null,
    sync: { status: 'idle', lastSyncedAt: null }
  })
  const [appMeta, setAppMeta] = useState<AppMeta | null>(null)
  const [material, setMaterial] = useState<'acrylic' | 'vibrancy' | 'solid'>('solid')
  const [warnings, setWarnings] = useState<string[]>([])
  const [warningsVisible, setWarningsVisible] = useState(true)
  const [view, setView] = useState<AppView>('tasks')
  const [mainTab, setMainTab] = useState<MainTab>('tasks')
  const [composer, setComposer] = useState<ComposerState | null>(null)
  const [noteEdit, setNoteEdit] = useState<NoteEditState | null>(null)
  const [editingKeywordsId, setEditingKeywordsId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [collapsedNoteIds, setCollapsedNoteIds] = useState<Set<string>>(() => new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [pendingSetting, setPendingSetting] = useState<PendingSetting>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [llmConfigured, setLlmConfigured] = useState(false)
  const [generatingNoteId, setGeneratingNoteId] = useState<string | null>(null)

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language]
  )

  const tasksRef = useRef<Task[]>([])
  const notesRef = useRef<Note[]>([])
  const pendingSettingRef = useRef<PendingSetting>(null)
  const toastIdRef = useRef(0)
  const toastTimerRef = useRef<number | null>(null)
  const highlightTimerRef = useRef<number | null>(null)

  const dismissToast = useCallback((id?: number) => {
    setToast((current) => {
      if (!current) return null
      if (id !== undefined && current.id !== id) return current
      return null
    })
  }, [])

  const showToast = useCallback(
    (
      message: string,
      options?: { tone?: 'success' | 'info' | 'error'; duration?: number; action?: ToastMessage['action'] }
    ) => {
      const id = ++toastIdRef.current
      setToast({
        id,
        message,
        tone: options?.tone ?? 'info',
        ...(options?.action ? { action: options.action } : {})
      })
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = window.setTimeout(
        () => {
          setToast((current) => (current?.id === id ? null : current))
          toastTimerRef.current = null
        },
        options?.duration ?? (options?.action ? 6000 : 4200)
      )
    },
    []
  )

  useEffect(() => {
    let alive = true

    const unsubscribeTheme = window.fujian.onThemeChanged((nextTheme) => {
      if (!alive) return
      setTheme(nextTheme)
    })
    const unsubscribeSettings = window.fujian.onSettingsChanged((payload) => {
      if (!alive) return
      setSettings(payload.settings)
      setLanguage(payload.language)
      setTheme(payload.theme)
      setAutoStartEnabled(payload.autoStartEnabled)
    })
    const unsubscribeAccount = window.fujian.onAccountChanged((next) => {
      if (!alive) return
      setAccount(next)
    })
    const unsubscribeTasks = window.fujian.onTasksChanged((next) => {
      if (!alive) return
      tasksRef.current = next
      setTasks(next)
    })
    const unsubscribeNotes = window.fujian.onNotesChanged((next) => {
      if (!alive) return
      notesRef.current = next
      setNotes(next)
    })
    const unsubscribeOpenSettings = window.fujian.onOpenSettings(() => {
      if (!alive) return
      setView('settings')
      setComposer(null)
      setFocusedId(null)
      setExpandedId(null)
      setContextMenu(null)
    })
    const unsubscribeNewTask = window.fujian.onNewTask(() => {
      if (!alive) return
      setView('tasks')
      setMainTab('tasks')
      setNoteEdit(null)
      setEditingKeywordsId(null)
      setFocusedId(null)
      setContextMenu(null)
      setComposer({ kind: 'task', mode: 'create' })
    })
    const unsubscribeNewNote = window.fujian.onNewNote(() => {
      if (!alive) return
      setView('tasks')
      setMainTab('notes')
      setNoteEdit(null)
      setEditingKeywordsId(null)
      setFocusedId(null)
      setContextMenu(null)
      setComposer({ kind: 'note', mode: 'create' })
    })

    async function bootstrap(): Promise<void> {
      try {
        const data = await window.fujian.getBootstrap()
        if (!alive) return
        tasksRef.current = data.tasks
        notesRef.current = data.notes
        setTasks(data.tasks)
        setNotes(data.notes)
        setLlmConfigured(data.llmConfigured)
        setSettings(data.settings)
        setLanguage(data.language)
        setTheme(data.theme)
        setAutoStartEnabled(data.autoStartEnabled)
        setAccount(
          data.account ?? {
            configured: false,
            user: null,
            sync: { status: 'idle', lastSyncedAt: null }
          }
        )
        document.documentElement.dataset.platform = data.platform
        setAppMeta({
          platform: data.platform,
          dataDir: data.dataDir,
          autoStartSupported: data.autoStartSupported,
          materialSupported: data.materialSupported
        })
        setMaterial(data.material)
        setWarnings(data.warnings)
        setLoading(false)
      } catch (error) {
        if (!alive) return
        setFatalError(error instanceof Error ? error.message : String(error))
        setLoading(false)
      }
    }

    void bootstrap()

    return () => {
      alive = false
      unsubscribeTheme()
      unsubscribeSettings()
      unsubscribeAccount()
      unsubscribeTasks()
      unsubscribeNotes()
      unsubscribeOpenSettings()
      unsubscribeNewTask()
      unsubscribeNewNote()
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme.dark ? 'dark' : 'light'
    root.style.setProperty('--accent', theme.accent)
    root.style.setProperty('--on-accent', theme.onAccent)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.material = material
  }, [material])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let lastHeight = 0

    function measure(): void {
      frame = 0
      const target = document.querySelector<HTMLElement>('.app')
      if (!target) return
      const bodyStyle = window.getComputedStyle(document.body)
      const verticalPadding =
        (Number.parseFloat(bodyStyle.paddingTop) || 0) +
        (Number.parseFloat(bodyStyle.paddingBottom) || 0)
      const height = Math.ceil(target.getBoundingClientRect().height + verticalPadding)
      if (height > 0 && Math.abs(height - lastHeight) > 0.5) {
        lastHeight = height
        window.fujian.resizeWindow(height)
      }
    }

    function schedule(): void {
      if (frame) return
      frame = window.requestAnimationFrame(measure)
    }

    const observer = new ResizeObserver(schedule)
    const target = document.querySelector<HTMLElement>('.app')
    if (target) observer.observe(target)
    observer.observe(document.body)
    window.addEventListener('resize', schedule)
    schedule()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [loading])

  useEffect(() => {
    if (!highlightedId) return
    const escapedId = window.CSS.escape(highlightedId)
    const element = document.querySelector<HTMLElement>(
      `[data-task-id="${escapedId}"], [data-note-id="${escapedId}"]`
    )
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedId((current) => (current === highlightedId ? null : current))
      highlightTimerRef.current = null
    }, 1400)
  }, [highlightedId])

  useEffect(() => {
    if (!composer) return
    const timer = window.setTimeout(() => {
      document.querySelector('.composer')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 30)
    return () => window.clearTimeout(timer)
  }, [composer])

  useEffect(() => {
    if (focusedId && !tasks.some((task) => task.id === focusedId && !task.archivedAt)) {
      setFocusedId(null)
    }
  }, [focusedId, tasks])

  const activeTasks = useMemo(() => sortActiveTasks(tasks), [tasks])
  const activeNotes = useMemo(() => sortActiveNotes(notes), [notes])
  const archivedTasks = useMemo(() => sortArchivedTasks(tasks), [tasks])
  const archivedNotes = useMemo(() => sortArchivedNotes(notes), [notes])
  const focusedTask = useMemo(
    () => activeTasks.find((task) => task.id === focusedId) ?? null,
    [activeTasks, focusedId]
  )
  const focusedMode = Boolean(focusedTask)
  const composerTask =
    composer?.kind === 'task' && composer.mode === 'edit'
      ? tasks.find((task) => task.id === composer.taskId)
      : undefined

  const commitTasks = useCallback(
    (updater: (previous: Task[]) => Task[]) => {
      const previous = tasksRef.current
      const next = updater(previous)
      tasksRef.current = next
      setTasks(next)
      void window.fujian
        .saveTasks(next)
        .then((result) => {
          if (!result.ok) {
            showToast(result.error ?? t('任务保存失败，请检查数据文件夹权限。'), {
              tone: 'error',
              duration: 8000
            })
          }
        })
        .catch((error: unknown) => {
          showToast(t('任务保存失败：{message}', { message: error instanceof Error ? error.message : String(error) }), {
            tone: 'error',
            duration: 8000
          })
        })
      return next
    },
    [showToast, t]
  )

  const commitNotes = useCallback(
    (updater: (previous: Note[]) => Note[]) => {
      const previous = notesRef.current
      const next = updater(previous)
      notesRef.current = next
      setNotes(next)
      void window.fujian
        .saveNotes(next)
        .then((result) => {
          if (!result.ok) {
            showToast(result.error ?? t('随记保存失败，请检查数据文件夹权限。'), {
              tone: 'error',
              duration: 8000
            })
          }
        })
        .catch((error: unknown) => {
          showToast(t('随记保存失败：{message}', { message: error instanceof Error ? error.message : String(error) }), {
            tone: 'error',
            duration: 8000
          })
        })
      return next
    },
    [showToast, t]
  )

  const persistSetting = useCallback(
    async (patch: Partial<AppSettings>, key: Exclude<PendingSetting, null>) => {
      if (pendingSettingRef.current) return
      pendingSettingRef.current = key
      setPendingSetting(key)
      try {
        const result = await window.fujian.updateSettings(patch)
        setSettings(result.settings)
        setLanguage(result.language)
        setTheme(result.theme)
        setAutoStartEnabled(result.autoStartEnabled)
        if (result.error) {
          showToast(result.error, { tone: 'error', duration: 6500 })
        }
      } catch (error) {
        showToast(t('设置更新失败：{message}', { message: error instanceof Error ? error.message : String(error) }), {
          tone: 'error'
        })
      } finally {
        pendingSettingRef.current = null
        setPendingSetting(null)
      }
    },
    [showToast, t]
  )

  const openSettings = useCallback(() => {
    setView('settings')
    setComposer(null)
    setNoteEdit(null)
    setEditingKeywordsId(null)
    setFocusedId(null)
    setExpandedId(null)
    setContextMenu(null)
    setDeleteTarget(null)
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const backToTasks = useCallback(() => {
    setView('tasks')
    setContextMenu(null)
  }, [])

  const switchMainTab = useCallback((next: MainTab) => {
    setMainTab(next)
    setComposer(null)
    setNoteEdit(null)
    setEditingKeywordsId(null)
    setExpandedId(null)
    setFocusedId(null)
    setContextMenu(null)
    setDeleteTarget(null)
    setHighlightedId(null)
  }, [])

  const showAddComposer = useCallback(
    (kind: MainTab) => {
      if (view === 'settings') setView('tasks')
      setMainTab(kind)
      setNoteEdit(null)
      setEditingKeywordsId(null)
      setFocusedId(null)
      setContextMenu(null)
      setExpandedId(null)
      setComposer({ kind: kind === 'notes' ? 'note' : 'task', mode: 'create' })
    },
    [view]
  )

  const openAddComposer = useCallback(() => {
    setNoteEdit(null)
    setEditingKeywordsId(null)
    if (composer) {
      setComposer(null)
      return
    }
    showAddComposer(mainTab)
  }, [composer, mainTab, showAddComposer])

  const openEditComposer = useCallback((task: Task) => {
    if (task.archivedAt) return
    setNoteEdit(null)
    setEditingKeywordsId(null)
    setFocusedId(null)
    setExpandedId(task.id)
    setContextMenu(null)
    setComposer({ kind: 'task', mode: 'edit', taskId: task.id })
  }, [])

  const startNoteEdit = useCallback(
    (noteId: string, focus: 'title' | 'content' = 'title', caret?: number) => {
      const note = notesRef.current.find((item) => item.id === noteId && !item.archivedAt)
      if (!note) return
      setFocusedId(null)
      setComposer(null)
      setEditingKeywordsId(null)
      setCollapsedNoteIds((current) => {
        if (!current.has(noteId)) return current
        const next = new Set(current)
        next.delete(noteId)
        return next
      })
      setContextMenu(null)
      setNoteEdit({
        noteId,
        focus,
        ...(caret !== undefined ? { caret } : {})
      })
    },
    []
  )

  const saveNoteEdit = useCallback(
    (draft: NoteEditDraft) => {
      if (!noteEdit) return
      const noteId = noteEdit.noteId
      const exists = notesRef.current.some((note) => note.id === noteId && !note.archivedAt)
      if (!exists) {
        setNoteEdit(null)
        return
      }
      const stamp = new Date().toISOString()
      commitNotes((previous) =>
        previous.map((note) =>
          note.id === noteId
            ? {
                ...note,
                title: draft.title,
                content: draft.content,
                important: draft.important,
                urgent: draft.urgent,
                titleAuto: draft.titleAuto,
                updatedAt: stamp
              }
            : note
        )
      )
      setNoteEdit(null)
    },
    [commitNotes, noteEdit]
  )

  const cancelNoteEdit = useCallback(() => setNoteEdit(null), [])

  const startKeywordEdit = useCallback((noteId: string) => {
    const note = notesRef.current.find((item) => item.id === noteId && !item.archivedAt)
    if (!note) return
    setNoteEdit(null)
    setCollapsedNoteIds((current) => {
      if (!current.has(noteId)) return current
      const next = new Set(current)
      next.delete(noteId)
      return next
    })
    setContextMenu(null)
    setEditingKeywordsId(noteId)
  }, [])

  const saveNoteKeywords = useCallback(
    (noteId: string, keywords: string[]) => {
      const exists = notesRef.current.some((note) => note.id === noteId && !note.archivedAt)
      if (!exists) {
        setEditingKeywordsId(null)
        return
      }
      const stamp = new Date().toISOString()
      commitNotes((previous) =>
        previous.map((note) =>
          note.id === noteId ? { ...note, keywords, updatedAt: stamp } : note
        )
      )
      setEditingKeywordsId(null)
    },
    [commitNotes]
  )

  const cancelKeywordEdit = useCallback(() => setEditingKeywordsId(null), [])

  const toggleNoteExpanded = useCallback((noteId: string) => {
    setCollapsedNoteIds((current) => {
      const next = new Set(current)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
    setContextMenu(null)
  }, [])

  const saveLlmKey = useCallback(async (key: string): Promise<AccountActionResult> => {
    const result = await window.fujian.setLlmKey(key)
    if (result.ok) setLlmConfigured(true)
    return result
  }, [])

  const generateAllNoteKeywords = useCallback(async () => {
    return window.fujian.generateAllNoteKeywords()
  }, [])

  const generateNoteKeywords = useCallback(
    async (noteId: string) => {
      if (generatingNoteId) return
      if (!llmConfigured) {
        showToast(t('请先在设置中填写 DeepSeek API Key。'), {
          tone: 'info',
          action: { label: t('去设置'), onClick: openSettings }
        })
        return
      }
      setGeneratingNoteId(noteId)
      try {
        const result = await window.fujian.generateNoteKeywords(noteId)
        if (!result.ok) {
          showToast(result.error ?? t('关键词生成失败。'), { tone: 'error', duration: 6500 })
          return
        }
        showToast(t('关键词已生成'), { tone: 'success' })
      } catch (error) {
        showToast(t('关键词生成失败：{message}', { message: error instanceof Error ? error.message : String(error) }), {
          tone: 'error',
          duration: 6500
        })
      } finally {
        setGeneratingNoteId(null)
      }
    },
    [generatingNoteId, llmConfigured, openSettings, showToast, t]
  )

  const restoreTask = useCallback(
    (taskId: string, message?: string) => {
      const exists = tasksRef.current.some((task) => task.id === taskId && task.archivedAt)
      if (!exists) return
      const stamp = new Date().toISOString()
      commitTasks((previous) =>
        previous.map((task) =>
          task.id === taskId ? { ...task, archivedAt: null, updatedAt: stamp } : task
        )
      )
      showToast(message ?? t('已恢复到任务列表'), { tone: 'success' })
    },
    [commitTasks, showToast, t]
  )

  const archiveTask = useCallback(
    (taskId: string) => {
      const target = tasksRef.current.find((task) => task.id === taskId)
      if (!target || target.archivedAt) return
      const stamp = new Date().toISOString()
      commitTasks((previous) =>
        previous.map((task) =>
          task.id === taskId ? { ...task, archivedAt: stamp, updatedAt: stamp } : task
        )
      )
      setFocusedId((current) => (current === taskId ? null : current))
      setExpandedId((current) => (current === taskId ? null : current))
      setContextMenu(null)
      showToast(t('任务已归档，可在设置中随时找回'), {
        tone: 'success',
        action: { label: t('撤销'), onClick: () => restoreTask(taskId, t('已撤销归档')) }
      })
    },
    [commitTasks, restoreTask, showToast, t]
  )

  const restoreNote = useCallback(
    (noteId: string, message?: string) => {
      const exists = notesRef.current.some((note) => note.id === noteId && note.archivedAt)
      if (!exists) return
      const stamp = new Date().toISOString()
      commitNotes((previous) =>
        previous.map((note) =>
          note.id === noteId ? { ...note, archivedAt: null, updatedAt: stamp } : note
        )
      )
      showToast(message ?? t('已恢复到随记'), { tone: 'success' })
    },
    [commitNotes, showToast, t]
  )

  const archiveNote = useCallback(
    (noteId: string) => {
      const target = notesRef.current.find((note) => note.id === noteId)
      if (!target || target.archivedAt) return
      const stamp = new Date().toISOString()
      commitNotes((previous) =>
        previous.map((note) =>
          note.id === noteId ? { ...note, archivedAt: stamp, updatedAt: stamp } : note
        )
      )
      if (noteEdit?.noteId === noteId) setNoteEdit(null)
      if (editingKeywordsId === noteId) setEditingKeywordsId(null)
      setCollapsedNoteIds((current) => {
        if (!current.has(noteId)) return current
        const next = new Set(current)
        next.delete(noteId)
        return next
      })
      setContextMenu(null)
      showToast(t('随记已归档，可在设置中随时找回'), {
        tone: 'success',
        action: { label: t('撤销'), onClick: () => restoreNote(noteId, t('已撤销归档')) }
      })
    },
    [commitNotes, editingKeywordsId, noteEdit?.noteId, restoreNote, showToast, t]
  )

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'task') {
      const taskId = deleteTarget.task.id
      commitTasks((previous) => previous.filter((task) => task.id !== taskId))
      showToast(t('归档任务已永久删除'), { tone: 'info' })
    } else {
      const noteId = deleteTarget.note.id
      commitNotes((previous) => previous.filter((note) => note.id !== noteId))
      if (noteEdit?.noteId === noteId) setNoteEdit(null)
      if (editingKeywordsId === noteId) setEditingKeywordsId(null)
      setCollapsedNoteIds((current) => {
        if (!current.has(noteId)) return current
        const next = new Set(current)
        next.delete(noteId)
        return next
      })
      showToast(t('随记已删除'), { tone: 'info' })
    }
    setDeleteTarget(null)
  }, [
    commitNotes,
    commitTasks,
    deleteTarget,
    editingKeywordsId,
    noteEdit?.noteId,
    showToast,
    t
  ])

  const enterFocus = useCallback(
    (taskId: string) => {
      if (!tasksRef.current.some((task) => task.id === taskId && !task.archivedAt)) return
      setFocusedId(taskId)
      setExpandedId(taskId)
      setComposer(null)
      setNoteEdit(null)
      setEditingKeywordsId(null)
      setContextMenu(null)
      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>(`[data-task-id="${window.CSS.escape(taskId)}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }, 50)
    },
    []
  )

  const exitFocus = useCallback(() => {
    setFocusedId(null)
  }, [])

  const toggleExpanded = useCallback((taskId: string) => {
    setExpandedId((current) => (current === taskId ? null : taskId))
    setContextMenu(null)
  }, [])

  const submitComposer = useCallback(
    (draft: ComposerDraft) => {
      if (!composer) return
      const stamp = new Date().toISOString()

      if (composer.kind === 'task') {
        if (composer.mode === 'edit') {
          const taskId = composer.taskId
          const exists = tasksRef.current.some((task) => task.id === taskId)
          if (!exists) {
            setComposer(null)
            return
          }
          commitTasks((previous) =>
            previous.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    title: draft.title,
                    note: draft.body,
                    important: draft.important,
                    urgent: draft.urgent,
                    updatedAt: stamp
                  }
                : task
            )
          )
          setExpandedId(taskId)
        } else {
          const task: Task = {
            id: makeId('task'),
            title: draft.title,
            note: draft.body,
            important: draft.important,
            urgent: draft.urgent,
            createdAt: stamp,
            updatedAt: null,
            archivedAt: null
          }
          commitTasks((previous) => [...previous, task])
          setExpandedId(null)
          setHighlightedId(task.id)
        }
      } else {
        const note: Note = {
          id: makeId('note'),
          title: draft.title,
          content: draft.body,
          keywords: [],
          titleAuto: draft.titleAuto === true,
          important: draft.important,
          urgent: draft.urgent,
          createdAt: stamp,
          updatedAt: null,
          archivedAt: null
        }
        commitNotes((previous) => [...previous, note])
        setExpandedId(null)
        setHighlightedId(note.id)
      }

      setComposer(null)
    },
    [commitNotes, commitTasks, composer]
  )

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>, kind: 'task' | 'note', id: string) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu({ kind, id, x: event.clientX, y: event.clientY })
    },
    []
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const commandKey = event.ctrlKey || event.metaKey

      if (commandKey && event.key.toLowerCase() === 'n') {
        if (loading || deleteTarget) return
        // Command+Shift+N always targets a note; Command+N follows the
        // currently visible tab. Opening (not toggling) keeps the macOS menu
        // accelerator and the renderer shortcut harmless together.
        event.preventDefault()
        showAddComposer(event.shiftKey ? 'notes' : mainTab)
        return
      }

      if (commandKey && event.key === ',') {
        if (loading || deleteTarget) return
        event.preventDefault()
        openSettings()
        return
      }

      if (event.key !== 'Escape') return
      if (deleteTarget) {
        event.preventDefault()
        setDeleteTarget(null)
        return
      }
      if (contextMenu) {
        event.preventDefault()
        setContextMenu(null)
        return
      }
      if (noteEdit) {
        event.preventDefault()
        setNoteEdit(null)
        return
      }
      if (editingKeywordsId) {
        event.preventDefault()
        setEditingKeywordsId(null)
        return
      }
      if (composer) {
        event.preventDefault()
        setComposer(null)
        return
      }
      if (view === 'settings') {
        event.preventDefault()
        setView('tasks')
        return
      }
      if (focusedId) {
        event.preventDefault()
        setFocusedId(null)
        return
      }
      if (expandedId) {
        event.preventDefault()
        setExpandedId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    composer,
    contextMenu,
    deleteTarget,
    editingKeywordsId,
    expandedId,
    focusedId,
    loading,
    noteEdit,
    mainTab,
    openSettings,
    showAddComposer,
    view
  ])

  async function openDataFolder(): Promise<void> {
    try {
      await window.fujian.openDataFolder()
    } catch (error) {
      showToast(t('无法打开数据文件夹：{message}', { message: error instanceof Error ? error.message : String(error) }), {
        tone: 'error'
      })
    }
  }

  if (loading) {
    return (
      <div className="app app--loading" aria-busy="true" aria-label={t('正在加载浮笺')}>
        <div className="loading-skeleton">
          <div className="skeleton skeleton--logo" />
          <div className="skeleton-lines">
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--subtitle" />
          </div>
        </div>
        <div className="skeleton skeleton--composer" />
        <div className="skeleton skeleton--task" />
        <div className="skeleton skeleton--task skeleton--task-short" />
      </div>
    )
  }

  if (fatalError || !appMeta) {
    return (
      <div className="app app--error">
        <div className="error-state">
          <span className="error-state__icon" aria-hidden="true">
            <CircleAlert size={20} strokeWidth={1.9} />
          </span>
          <h1>{t('浮笺没能启动')}</h1>
          <p>{fatalError ?? t('无法读取应用信息。')}</p>
          <div className="error-state__actions">
            <button type="button" className="ghost-button" onClick={() => window.fujian.quit()}>
              {t('退出')}
            </button>
            <button type="button" className="primary-button" onClick={() => window.location.reload()}>
              <RefreshCw size={14} />
              {t('重新加载')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const contextTask =
    contextMenu?.kind === 'task'
      ? tasks.find((task) => task.id === contextMenu.id && !task.archivedAt) ?? null
      : null
  const contextNote =
    contextMenu?.kind === 'note' ? notes.find((note) => note.id === contextMenu.id) ?? null : null

  return (
    <I18nProvider language={language}>
      <div className={`app app--${material}${focusedMode ? ' app--focus-mode' : ''}`}>
      <span className="window-drag-edge window-drag-edge--top" aria-hidden="true" />
      <span className="window-drag-edge window-drag-edge--left" aria-hidden="true" />
      <span className="window-drag-edge window-drag-edge--right" aria-hidden="true" />
      {view === 'tasks' ? (
        <>
          <TopBar
            now={now}
            platform={appMeta.platform}
            mainTab={mainTab}
            alwaysOnTop={settings.alwaysOnTop}
            composerOpen={Boolean(composer)}
            onTogglePin={() => void persistSetting({ alwaysOnTop: !settings.alwaysOnTop }, 'alwaysOnTop')}
            onAdd={openAddComposer}
            onOpenSettings={openSettings}
          />

          {warnings.length > 0 && warningsVisible && (
            <div className="notice-banner" role="status">
              <CircleAlert size={14} strokeWidth={2} aria-hidden="true" />
              <span title={warnings.join('\n')}>{warnings.join(' ')}</span>
              <button
                type="button"
                onClick={() => setWarningsVisible(false)}
                aria-label={t('关闭提示')}
                title={t('关闭')}
              >
                <X size={12.5} strokeWidth={2.2} />
              </button>
            </div>
          )}

          <ViewSwitch value={mainTab} onChange={switchMainTab} />

          {composer && (composer.mode === 'create' || composerTask) && (
            <Composer
              key={
                composer.mode === 'edit'
                  ? `task-edit-${composer.taskId}`
                  : `${composer.kind}-create`
              }
              mode={composer.mode}
              kind={composer.kind}
              {...(composerTask ? { task: composerTask } : {})}
              onSubmit={submitComposer}
              onCancel={() => setComposer(null)}
            />
          )}

          {mainTab === 'tasks' ? (
            <>
              {focusedTask && <FocusBanner title={focusedTask.title} onExit={exitFocus} />}

              {activeTasks.length === 0 ? (
                composer ? null : <EmptyState onAdd={openAddComposer} />
              ) : (
                <div className={`task-list${focusedMode ? ' task-list--focused' : ''}`} role="list">
                  {activeTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      expanded={expandedId === task.id}
                      focused={focusedTask?.id === task.id}
                      focusMode={focusedMode}
                      isNew={highlightedId === task.id}
                      onToggle={() => toggleExpanded(task.id)}
                      onFocus={() => enterFocus(task.id)}
                      onExitFocus={exitFocus}
                      onEdit={() => openEditComposer(task)}
                      onArchive={() => archiveTask(task.id)}
                      onContextMenu={(event) => handleContextMenu(event, 'task', task.id)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {activeNotes.length === 0 ? (
                composer ? null : (
                  <EmptyState
                    onAdd={openAddComposer}
                    title={t('还没有随记')}
                    hint={t('把一闪而过的想法留在这里。')}
                    actionLabel={t('写第一条随记')}
                  />
                )
              ) : (
                <div className="task-list note-list" role="list">
                  {activeNotes.map((note) => (
                    <NoteItem
                      key={note.id}
                      note={note}
                      expanded={!collapsedNoteIds.has(note.id)}
                      isNew={highlightedId === note.id}
                      generating={generatingNoteId === note.id}
                      editing={noteEdit?.noteId === note.id}
                      initialEditFocus={
                        noteEdit?.noteId === note.id ? noteEdit.focus : 'title'
                      }
                      {...(noteEdit?.noteId === note.id && noteEdit.caret !== undefined
                        ? { initialCaret: noteEdit.caret }
                        : {})}
                      editingKeywords={editingKeywordsId === note.id}
                      onToggle={() => toggleNoteExpanded(note.id)}
                      onStartEdit={(focus, caret) => startNoteEdit(note.id, focus, caret)}
                      onCancelEdit={cancelNoteEdit}
                      onSaveEdit={saveNoteEdit}
                      onGenerate={() => void generateNoteKeywords(note.id)}
                      onEditKeywords={() => startKeywordEdit(note.id)}
                      onSaveKeywords={(keywords) => saveNoteKeywords(note.id, keywords)}
                      onCancelKeywords={cancelKeywordEdit}
                      onArchive={() => archiveNote(note.id)}
                      onContextMenu={(event) => handleContextMenu(event, 'note', note.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <SettingsView
          settings={settings}
          languagePreference={settings.language}
          autoStartEnabled={autoStartEnabled}
          autoStartSupported={appMeta.autoStartSupported}
          archivedTasks={archivedTasks}
          archivedNotes={archivedNotes}
          dataDir={appMeta.dataDir}
          account={account}
          llmConfigured={llmConfigured}
          pendingSetting={pendingSetting}
          onBack={backToTasks}
          onThemeChange={(nextTheme: ThemePreference) =>
            void persistSetting({ theme: nextTheme }, 'theme')
          }
          onLanguageChange={(nextLanguage) =>
            void persistSetting({ language: nextLanguage }, 'language')
          }
          onToggleAlwaysOnTop={() =>
            void persistSetting({ alwaysOnTop: !settings.alwaysOnTop }, 'alwaysOnTop')
          }
          onToggleAutoStart={() =>
            void persistSetting({ launchAtLogin: !autoStartEnabled }, 'launchAtLogin')
          }
          onRestore={(task) => restoreTask(task.id)}
          onRestoreNote={(note) => restoreNote(note.id)}
          onRequestDelete={(task) => setDeleteTarget({ kind: 'task', task })}
          onRequestDeleteNote={(note) => setDeleteTarget({ kind: 'note', note })}
          onOpenDataFolder={() => void openDataFolder()}
          onRequestLoginCode={(email) => window.fujian.requestLoginCode(email)}
          onVerifyLoginCode={(email, code) => window.fujian.verifyLoginCode(email, code)}
          onSignOut={() => window.fujian.signOut()}
          onSyncNow={() => window.fujian.syncNow()}
          onSetLlmKey={saveLlmKey}
          onGenerateAllKeywords={generateAllNoteKeywords}
          onQuit={() => window.fujian.quit()}
        />
      )}

      {contextTask && contextMenu?.kind === 'task' && (
        <TaskContextMenu
          task={contextTask}
          x={contextMenu.x}
          y={contextMenu.y}
          focused={focusedTask?.id === contextTask.id}
          onFocus={() => enterFocus(contextTask.id)}
          onExitFocus={exitFocus}
          onEdit={() => openEditComposer(contextTask)}
          onArchive={() => archiveTask(contextTask.id)}
          onClose={closeContextMenu}
        />
      )}

      {contextNote && contextMenu?.kind === 'note' && (
        <NoteContextMenu
          note={contextNote}
          x={contextMenu.x}
          y={contextMenu.y}
          generating={generatingNoteId === contextNote.id}
          onGenerate={() => void generateNoteKeywords(contextNote.id)}
          onEditKeywords={() => startKeywordEdit(contextNote.id)}
          onEdit={() => startNoteEdit(contextNote.id)}
          onArchive={() => archiveNote(contextNote.id)}
          onDelete={() => setDeleteTarget({ kind: 'note', note: contextNote })}
          onClose={closeContextMenu}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={deleteTarget.kind === 'task' ? t('永久删除这条归档？') : t('删除这条随记？')}
          description={
            deleteTarget.kind === 'task'
              ? t('“{title}”将从本机数据中彻底移除，此操作无法撤销。', { title: deleteTarget.task.title })
              : t('“{title}”将从随记中移除，此操作无法撤销。', { title: deleteTarget.note.title })
          }
          confirmLabel={deleteTarget.kind === 'task' ? t('永久删除') : t('删除')}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

        {toast && <Toast toast={toast} onDismiss={() => dismissToast(toast.id)} />}
      </div>
    </I18nProvider>
  )
}
