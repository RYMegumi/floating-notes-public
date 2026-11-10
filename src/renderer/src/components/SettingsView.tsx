import { useState } from 'react'
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  FolderOpen,
  LogOut,
  Monitor,
  Moon,
  Pin,
  Power,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  UserRound
} from 'lucide-react'
import type { LanguagePreference } from '@shared/i18n'
import type {
  AccountActionResult,
  AccountState,
  AppSettings,
  BulkKeywordsResult,
  Note,
  Task,
  ThemePreference
} from '@shared/types'
import { useI18n } from '../i18n'
import { formatArchiveTime } from '../utils/date'

interface SettingsViewProps {
  settings: AppSettings
  languagePreference: LanguagePreference
  autoStartEnabled: boolean
  autoStartSupported: boolean
  archivedTasks: Task[]
  archivedNotes: Note[]
  dataDir: string
  account: AccountState
  llmConfigured: boolean
  pendingSetting: string | null
  onBack: () => void
  onThemeChange: (theme: ThemePreference) => void
  onLanguageChange: (language: LanguagePreference) => void
  onToggleAlwaysOnTop: () => void
  onToggleAutoStart: () => void
  onRestore: (task: Task) => void
  onRestoreNote: (note: Note) => void
  onRequestDelete: (task: Task) => void
  onRequestDeleteNote: (note: Note) => void
  onOpenDataFolder: () => void
  onRequestLoginCode: (email: string) => Promise<AccountActionResult>
  onVerifyLoginCode: (email: string, code: string) => Promise<AccountActionResult>
  onSignOut: () => Promise<void>
  onSyncNow: () => Promise<AccountActionResult>
  onSetLlmKey: (key: string) => Promise<AccountActionResult>
  onGenerateAllKeywords: () => Promise<BulkKeywordsResult>
  onQuit: () => void
}

const THEME_OPTIONS: Array<{
  value: ThemePreference
  labelKey: string
  icon: typeof Monitor
}> = [
  { value: 'system', labelKey: '跟随系统', icon: Monitor },
  { value: 'light', labelKey: '浅色', icon: Sun },
  { value: 'dark', labelKey: '深色', icon: Moon }
]

const LANGUAGE_OPTIONS: Array<{ value: LanguagePreference; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' }
]

function SettingSwitch({
  checked,
  disabled,
  label,
  onClick
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="switch__thumb" />
    </button>
  )
}

export function SettingsView({
  settings,
  languagePreference,
  autoStartEnabled,
  autoStartSupported,
  archivedTasks,
  archivedNotes,
  dataDir,
  account,
  llmConfigured,
  pendingSetting,
  onBack,
  onThemeChange,
  onLanguageChange,
  onToggleAlwaysOnTop,
  onToggleAutoStart,
  onRestore,
  onRestoreNote,
  onRequestDelete,
  onRequestDeleteNote,
  onOpenDataFolder,
  onRequestLoginCode,
  onVerifyLoginCode,
  onSignOut,
  onSyncNow,
  onSetLlmKey,
  onGenerateAllKeywords,
  onQuit
}: SettingsViewProps) {
  const { language, t } = useI18n()
  const settingsBusy = pendingSetting !== null
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archivedEntries = [
    ...archivedTasks.map((task) => ({ kind: 'task' as const, task })),
    ...archivedNotes.map((note) => ({ kind: 'note' as const, note }))
  ].sort((a, b) => {
    const aTime = a.kind === 'task' ? a.task.archivedAt : a.note.archivedAt
    const bTime = b.kind === 'task' ? b.task.archivedAt : b.note.archivedAt
    return (Date.parse(bTime ?? '') || 0) - (Date.parse(aTime ?? '') || 0)
  })
  const archivedCount = archivedEntries.length
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [accountBusy, setAccountBusy] = useState<'code' | 'verify' | 'sync' | 'signout' | null>(
    null
  )
  const [accountMessage, setAccountMessage] = useState<{
    tone: 'error' | 'info'
    text: string
  } | null>(null)
  const [llmKey, setLlmKey] = useState('')
  const [llmKeyEditing, setLlmKeyEditing] = useState(false)
  const [llmBusy, setLlmBusy] = useState(false)
  const [llmMessage, setLlmMessage] = useState<{
    tone: 'error' | 'info'
    text: string
  } | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<{
    tone: 'error' | 'info'
    text: string
  } | null>(null)

  const syncLabel = (() => {
    if (!account.user) return ''
    if (account.sync.status === 'syncing') return t('同步中')
    if (account.sync.status === 'error') return t('同步失败')
    if (!account.sync.lastSyncedAt) return t('尚未同步')
    return t('已同步 {time}', {
      time: new Date(account.sync.lastSyncedAt).toLocaleTimeString(
        language === 'en' ? 'en-US' : 'zh-CN',
        { hour: '2-digit', minute: '2-digit' }
      )
    })
  })()

  async function sendLoginCode(): Promise<void> {
    if (accountBusy) return
    const address = email.trim()
    if (!address) {
      setAccountMessage({ tone: 'error', text: t('请输入邮箱地址。') })
      return
    }
    setAccountBusy('code')
    setAccountMessage(null)
    try {
      const result = await onRequestLoginCode(address)
      if (result.ok) {
        setCodeSent(true)
        setCode('')
        setAccountMessage({ tone: 'info', text: t('验证码已发送。') })
      } else {
        setAccountMessage({ tone: 'error', text: result.error ?? t('验证码发送失败。') })
      }
    } catch (error) {
      setAccountMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : t('验证码发送失败。')
      })
    } finally {
      setAccountBusy(null)
    }
  }

  async function verifyLoginCode(): Promise<void> {
    if (accountBusy) return
    const address = email.trim()
    const token = code.trim()
    if (!token) {
      setAccountMessage({ tone: 'error', text: t('请输入验证码。') })
      return
    }
    setAccountBusy('verify')
    setAccountMessage(null)
    try {
      const result = await onVerifyLoginCode(address, token)
      if (result.ok) {
        setAccountMessage(null)
      } else {
        setAccountMessage({ tone: 'error', text: result.error ?? t('登录失败。') })
      }
    } catch (error) {
      setAccountMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : t('登录失败。')
      })
    } finally {
      setAccountBusy(null)
    }
  }

  async function signOut(): Promise<void> {
    if (accountBusy) return
    setAccountBusy('signout')
    setAccountMessage(null)
    try {
      await onSignOut()
      setEmail('')
      setCode('')
      setCodeSent(false)
    } catch (error) {
      setAccountMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : t('退出登录失败。')
      })
    } finally {
      setAccountBusy(null)
    }
  }

  async function syncNow(): Promise<void> {
    if (accountBusy) return
    setAccountBusy('sync')
    setAccountMessage(null)
    try {
      const result = await onSyncNow()
      if (!result.ok) {
        setAccountMessage({ tone: 'error', text: result.error ?? t('同步失败。') })
      }
    } catch (error) {
      setAccountMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : t('同步失败。')
      })
    } finally {
      setAccountBusy(null)
    }
  }

  async function saveLlmKey(): Promise<void> {
    if (llmBusy || !llmKey.trim()) return
    setLlmBusy(true)
    setLlmMessage(null)
    try {
      const result = await onSetLlmKey(llmKey.trim())
      if (result.ok) {
        setLlmKey('')
        setLlmKeyEditing(false)
        setLlmMessage({ tone: 'info', text: t('API Key 已保存。') })
      } else {
        setLlmMessage({ tone: 'error', text: result.error ?? t('保存失败。') })
      }
    } catch (error) {
      setLlmMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : t('保存失败。')
      })
    } finally {
      setLlmBusy(false)
    }
  }

  async function generateAllKeywords(): Promise<void> {
    if (bulkBusy || !llmConfigured) return
    setBulkBusy(true)
    setBulkMessage(null)
    try {
      const result = await onGenerateAllKeywords()
      if (!result.ok) {
        setBulkMessage({ tone: 'error', text: result.error ?? t('生成失败。') })
        return
      }
      const total = result.total ?? 0
      const generated = result.generated ?? 0
      const failed = result.failed ?? 0
      if (total === 0) {
        setBulkMessage({ tone: 'info', text: t('所有随记都有关键词了。') })
      } else if (failed === 0) {
        setBulkMessage({ tone: 'info', text: t('已为 {count} 条随记生成关键词。', { count: generated }) })
      } else {
        setBulkMessage({
          tone: 'error',
          text: t('已生成 {count} 条，{failed} 条失败。', { count: generated, failed })
        })
      }
    } catch (error) {
      setBulkMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : t('生成失败。')
      })
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="settings-view">
      <header className="settings-topbar">
        <button
          type="button"
          className="icon-button no-drag"
          onClick={onBack}
          aria-label={t('返回任务列表')}
          title={t('返回')}
        >
          <ChevronLeft size={18} strokeWidth={2.1} />
        </button>
        <h1>{t('设置')}</h1>
      </header>

      <div className="settings-scroll">
        <section className="settings-section settings-section--account">
          <div className="settings-section__heading">
            <h2>{t('账户')}</h2>
            {account.user && <span>{syncLabel}</span>}
          </div>

          {!account.configured ? (
            <div className="account-unavailable">{t('账号服务未配置')}</div>
          ) : account.user ? (
            <div className="account-card">
              <div className="account-user-row">
                <div className="setting-row__icon" aria-hidden="true">
                  <UserRound size={15.5} strokeWidth={2} />
                </div>
                <div className="account-user-text">
                  <span className="account-email" title={account.user.email}>
                    {account.user.email}
                  </span>
                  {account.sync.status === 'error' && (
                    <span className="account-sync-error">
                      {account.sync.error ?? t('同步失败')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="text-action account-action-link"
                  onClick={() => void syncNow()}
                  disabled={accountBusy !== null || account.sync.status === 'syncing'}
                >
                  <RefreshCw
                    size={12}
                    strokeWidth={2.1}
                    className={account.sync.status === 'syncing' ? 'is-spinning' : undefined}
                  />
                  {account.sync.status === 'syncing' ? t('同步中') : t('同步')}
                </button>
                <button
                  type="button"
                  className="account-action-link account-action-link--quiet"
                  onClick={() => void signOut()}
                  disabled={accountBusy !== null}
                  title={t('退出登录')}
                >
                  <LogOut size={12.5} strokeWidth={2.1} />
                  {t('退出')}
                </button>
              </div>
              {accountMessage && (
                <p
                  className={`account-message account-message--${accountMessage.tone}`}
                  role={accountMessage.tone === 'error' ? 'alert' : 'status'}
                >
                  {accountMessage.text}
                </p>
              )}
            </div>
          ) : (
            <form
              className="account-form"
              onSubmit={(event) => {
                event.preventDefault()
                if (codeSent) void verifyLoginCode()
                else void sendLoginCode()
              }}
            >
              {!codeSent ? (
                <div className="account-input-row">
                  <input
                    className="account-input"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('邮箱')}
                    aria-label={t('邮箱')}
                    autoComplete="email"
                    disabled={accountBusy !== null}
                  />
                  <button
                    type="submit"
                    className="account-submit"
                    disabled={accountBusy !== null || !email.trim()}
                  >
                    {accountBusy === 'code' ? t('发送中') : t('发送验证码')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="account-email-line">
                    <span className="account-email" title={email}>
                      {email}
                    </span>
                    <button
                      type="button"
                      className="text-action account-change-email"
                      onClick={() => {
                        setCodeSent(false)
                        setCode('')
                        setAccountMessage(null)
                      }}
                      disabled={accountBusy !== null}
                    >
                      {t('更换邮箱')}
                    </button>
                  </div>
                  <div className="account-input-row">
                    <input
                      className="account-input"
                      type="text"
                      inputMode="numeric"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder={t('验证码')}
                      aria-label={t('验证码')}
                      autoComplete="one-time-code"
                      maxLength={10}
                      disabled={accountBusy !== null}
                    />
                    <button
                      type="submit"
                      className="account-submit account-submit--primary"
                      disabled={accountBusy !== null || !code.trim()}
                    >
                      {accountBusy === 'verify' ? t('登录中') : t('登录')}
                    </button>
                  </div>
                </>
              )}
              {accountMessage && (
                <p
                  className={`account-message account-message--${accountMessage.tone}`}
                  role={accountMessage.tone === 'error' ? 'alert' : 'status'}
                >
                  {accountMessage.text}
                </p>
              )}
            </form>
          )}

          <div className="llm-key-block">
            <div className="settings-section__heading llm-key-block__heading">
              <h2>{t('AI 关键词')}</h2>
              <span>{llmConfigured ? t('DeepSeek 已配置') : t('DeepSeek 未配置')}</span>
            </div>
            <div className="account-input-row">
              <input
                className="account-input llm-key-input"
                type={llmConfigured && !llmKeyEditing ? 'text' : 'password'}
                value={llmConfigured && !llmKeyEditing ? '••••••••••••' : llmKey}
                onChange={(event) => setLlmKey(event.target.value)}
                onFocus={() => {
                  if (llmConfigured && !llmKeyEditing) {
                    setLlmKeyEditing(true)
                    setLlmKey('')
                    setLlmMessage(null)
                  }
                }}
                onBlur={() => {
                  if (!llmKey.trim()) setLlmKeyEditing(false)
                }}
                placeholder={
                  llmConfigured ? t('输入新 Key') : t('DeepSeek API Key（sk-…）')
                }
                aria-label={t('DeepSeek API Key')}
                autoComplete="off"
                spellCheck={false}
                disabled={llmBusy}
              />
              <button
                type="button"
                className="account-submit"
                onClick={() => void saveLlmKey()}
                disabled={llmBusy || !llmKey.trim()}
              >
                {llmBusy ? t('保存中') : t('保存')}
              </button>
            </div>
            <button
              type="button"
              className="llm-bulk-button"
              onClick={() => void generateAllKeywords()}
              disabled={!llmConfigured || bulkBusy || llmBusy}
            >
              <Sparkles size={13} strokeWidth={2} />
              {bulkBusy
                ? t('正在为缺少关键词的随记生成…')
                : t('为没有关键词的随记生成关键词')}
            </button>
            {llmMessage && (
              <p
                className={`account-message account-message--${llmMessage.tone}`}
                role={llmMessage.tone === 'error' ? 'alert' : 'status'}
              >
                {llmMessage.text}
              </p>
            )}
            {bulkMessage && (
              <p
                className={`account-message account-message--${bulkMessage.tone}`}
                role={bulkMessage.tone === 'error' ? 'alert' : 'status'}
              >
                {bulkMessage.text}
              </p>
            )}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <h2>{t('外观')}</h2>
          </div>
          <div className="theme-segment" role="group" aria-label={t('主题')}>
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon
              const active = settings.theme === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`theme-segment__item${active ? ' is-active' : ''}`}
                  onClick={() => onThemeChange(option.value)}
                  disabled={settingsBusy}
                  aria-pressed={active}
                >
                  <Icon size={14} strokeWidth={2} />
                  {t(option.labelKey)}
                </button>
              )
            })}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <h2>{t('语言')}</h2>
          </div>
          <div className="theme-segment" role="group" aria-label={t('语言')}>
            {LANGUAGE_OPTIONS.map((option) => {
              const active = languagePreference === option.value
              const label = option.value === 'system' ? t('跟随系统') : option.label
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`theme-segment__item${active ? ' is-active' : ''}`}
                  onClick={() => onLanguageChange(option.value)}
                  disabled={settingsBusy}
                  aria-pressed={active}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <h2>{t('窗口')}</h2>
          </div>
          <div className="setting-row">
            <div className="setting-row__icon" aria-hidden="true">
              <Pin size={15.5} strokeWidth={2} />
            </div>
            <div className="setting-row__text">
              <span className="setting-row__title">{t('始终置顶')}</span>
            </div>
            <SettingSwitch
              checked={settings.alwaysOnTop}
              disabled={settingsBusy}
              label={t('始终置顶')}
              onClick={onToggleAlwaysOnTop}
            />
          </div>
          <div className="setting-row">
            <div className="setting-row__icon" aria-hidden="true">
              <Power size={15.5} strokeWidth={2} />
            </div>
            <div className="setting-row__text">
              <span className="setting-row__title">{t('开机自启')}</span>
            </div>
            <SettingSwitch
              checked={autoStartEnabled}
              disabled={settingsBusy || !autoStartSupported}
              label={t('开机自启')}
              onClick={onToggleAutoStart}
            />
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <h2>{t('归档')}</h2>
            <span>{archivedCount > 0 ? t('{count} 项归档', { count: archivedCount }) : t('已完成与随记')}</span>
          </div>

          {archivedCount === 0 ? (
            <div className="archive-empty">
              <span className="archive-empty__icon" aria-hidden="true">
                <Archive size={17} strokeWidth={1.8} />
              </span>
              <div>
                <p>{t('还没有归档')}</p>
                <span>{t('右键任务或随记并选择归档，完成的事项会留在这里。')}</span>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={`archive-toggle${archiveOpen ? ' is-open' : ''}`}
                aria-expanded={archiveOpen}
                onClick={() => setArchiveOpen((value) => !value)}
              >
                <span className="archive-toggle__label">
                  <Archive size={13.5} strokeWidth={1.8} />
                  {archiveOpen ? t('收起归档') : t('查看归档')}
                </span>
                <span className="archive-toggle__meta">
                  {t('{count} 项', { count: archivedCount })}
                  <ChevronDown size={13.5} strokeWidth={2} aria-hidden="true" />
                </span>
              </button>

              {archiveOpen && (
                <div className="archive-list archive-list--open" aria-label={t('归档内容')}>
                  {archivedEntries.map((entry) => {
                    const isTask = entry.kind === 'task'
                    const title = isTask ? entry.task.title : entry.note.title
                    const body = isTask ? entry.task.note : entry.note.content
                    const archivedAt = isTask ? entry.task.archivedAt : entry.note.archivedAt
                    const important = isTask ? entry.task.important : entry.note.important
                    const urgent = isTask ? entry.task.urgent : entry.note.urgent
                    const keywords = isTask ? [] : entry.note.keywords
                    return (
                      <article className="archive-item" key={`${entry.kind}-${isTask ? entry.task.id : entry.note.id}`}>
                        <div className="archive-item__top">
                          <h3>{title}</h3>
                          <div className="archive-item__actions">
                            <button
                              type="button"
                              className="archive-action-button"
                              onClick={() =>
                                isTask ? onRestore(entry.task) : onRestoreNote(entry.note)
                              }
                              title={isTask ? t('恢复到任务列表') : t('恢复到随记')}
                              aria-label={t('恢复 {title}', { title })}
                            >
                              <RotateCcw size={13} strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              className="archive-action-button archive-action-button--danger"
                              onClick={() =>
                                isTask
                                  ? onRequestDelete(entry.task)
                                  : onRequestDeleteNote(entry.note)
                              }
                              title={t('永久删除')}
                              aria-label={t('永久删除 {title}', { title })}
                            >
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                        {body && <p className="archive-item__note">{body}</p>}
                        <div className="archive-item__meta">
                          <span className={`archive-kind archive-kind--${entry.kind}`}>
                            {isTask ? t('待办') : t('随记')}
                          </span>
                          <span>{formatArchiveTime(archivedAt ?? '', language)}</span>
                          {keywords.length > 0 && (
                            <span className="archive-item__keywords" title={keywords.join(' · ')}>
                              {keywords.join(' · ')}
                            </span>
                          )}
                          {important && (
                            <span className="archive-flag archive-flag--important">{t('重要')}</span>
                          )}
                          {urgent && (
                            <span className="archive-flag archive-flag--urgent">{t('紧急')}</span>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </section>

        <section className="settings-section settings-section--data">
          <div className="settings-section__heading">
            <h2>{t('数据')}</h2>
          </div>
          <button type="button" className="data-row" onClick={onOpenDataFolder}>
            <span className="data-row__icon" aria-hidden="true">
              <FolderOpen size={15} strokeWidth={1.9} />
            </span>
            <span className="data-row__text">
              <span>{t('打开数据文件夹')}</span>
              <span className="data-row__path" title={dataDir}>
                {dataDir}
              </span>
            </span>
          </button>
        </section>

        <footer className="settings-footer">
          <button type="button" className="quit-button" onClick={onQuit}>
            {t('退出浮笺')}
          </button>
        </footer>
      </div>
    </div>
  )
}
