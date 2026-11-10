import { Pin, Plus, Settings2 } from 'lucide-react'
import type { AppPlatform } from '@shared/types'
import type { MainTab } from './ViewSwitch'
import { useI18n } from '../i18n'
import { formatToday } from '../utils/date'

interface TopBarProps {
  now: Date
  platform: AppPlatform
  mainTab: MainTab
  alwaysOnTop: boolean
  composerOpen: boolean
  onTogglePin: () => void
  onAdd: () => void
  onOpenSettings: () => void
}

export function TopBar({
  now,
  platform,
  mainTab,
  alwaysOnTop,
  composerOpen,
  onTogglePin,
  onAdd,
  onOpenSettings
}: TopBarProps) {
  const { language, t } = useI18n()
  const { monthDay, weekday } = formatToday(now, language)
  const addShortcut = platform === 'darwin' ? '⌘N' : 'Ctrl+N'
  const addAction = mainTab === 'notes' ? t('添加随记') : t('添加任务')

  return (
    <header className="topbar">
      <div className="topbar__drag">
        <div className="date-line">
          <h1>{monthDay}</h1>
          <span className="weekday">{weekday}</span>
        </div>
      </div>

      <div className="topbar__actions no-drag">
        <button
          type="button"
          className={`icon-button pin-button${alwaysOnTop ? ' is-active' : ''}`}
          onClick={onTogglePin}
          title={alwaysOnTop ? t('取消窗口置顶') : t('窗口置顶')}
          aria-label={alwaysOnTop ? t('取消窗口置顶') : t('窗口置顶')}
          aria-pressed={alwaysOnTop}
        >
          <Pin size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`add-button${composerOpen ? ' is-open' : ''}`}
          onClick={onAdd}
          title={
            composerOpen ? t('关闭编辑') : `${addAction} (${addShortcut})`
          }
          aria-label={composerOpen ? t('关闭编辑') : addAction}
        >
          <Plus size={19} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onOpenSettings}
          title={t('设置与归档')}
          aria-label={t('设置与归档')}
        >
          <Settings2 size={16.5} strokeWidth={1.9} />
        </button>
      </div>
    </header>
  )
}
