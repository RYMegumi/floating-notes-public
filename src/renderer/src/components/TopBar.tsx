import { Pin, Plus, Settings2 } from 'lucide-react'
import type { AppPlatform } from '@shared/types'
import type { MainTab } from './ViewSwitch'
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
  const { monthDay, weekday } = formatToday(now)
  const addShortcut = platform === 'darwin' ? '⌘N' : 'Ctrl+N'
  const addLabel = mainTab === 'notes' ? '随记' : '任务'

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
          title={alwaysOnTop ? '取消窗口置顶' : '窗口置顶'}
          aria-label={alwaysOnTop ? '取消窗口置顶' : '窗口置顶'}
          aria-pressed={alwaysOnTop}
        >
          <Pin size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`add-button${composerOpen ? ' is-open' : ''}`}
          onClick={onAdd}
          title={composerOpen ? '关闭编辑' : `添加${addLabel} (${addShortcut})`}
          aria-label={composerOpen ? '关闭编辑' : `添加${addLabel}`}
        >
          <Plus size={19} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onOpenSettings}
          title="设置与归档"
          aria-label="设置与归档"
        >
          <Settings2 size={16.5} strokeWidth={1.9} />
        </button>
      </div>
    </header>
  )
}
