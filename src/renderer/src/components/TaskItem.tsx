import { Archive, ChevronDown, Clock3, Flag, Pencil, Target, Zap } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { Task } from '@shared/types'
import { PRIORITY_LABELS, priorityTier } from '@shared/sort'
import { formatTaskTime } from '../utils/date'

interface TaskItemProps {
  task: Task
  expanded: boolean
  focused: boolean
  focusMode: boolean
  isNew: boolean
  onToggle: () => void
  onFocus: () => void
  onExitFocus: () => void
  onEdit: () => void
  onArchive: () => void
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
}

export function TaskItem({
  task,
  expanded,
  focused,
  focusMode,
  isNew,
  onToggle,
  onFocus,
  onExitFocus,
  onEdit,
  onArchive,
  onContextMenu
}: TaskItemProps) {
  const tier = priorityTier(task)
  const isDimmed = focusMode && !focused
  const detailOpen = expanded || focused

  return (
    <article
      className={[
        'task',
        `task--tier-${tier}`,
        detailOpen ? 'is-expanded' : '',
        focused ? 'is-focused' : '',
        isDimmed ? 'is-dimmed' : '',
        isNew ? 'is-new' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      data-task-id={task.id}
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        className="task__summary"
        onClick={focused ? onExitFocus : onToggle}
        aria-expanded={detailOpen}
        aria-label={`${task.title}，${PRIORITY_LABELS[tier]}${focused ? '，正在专注' : ''}`}
        tabIndex={isDimmed ? -1 : 0}
      >
        <span className={`priority-mark priority-mark--${tier}`} aria-hidden="true">
          <span className="priority-mark__core" />
        </span>
        <span className="task__title">{task.title}</span>
        {focused ? (
          <span className="focus-chip">
            <Target size={11.5} strokeWidth={2.2} />
            专注
          </span>
        ) : (
          <ChevronDown
            className={`task__chevron${detailOpen ? ' is-open' : ''}`}
            size={15}
            strokeWidth={2}
            aria-hidden="true"
          />
        )}
      </button>

      {detailOpen && (
        <div className="task__detail">
          {task.note ? (
            <p className="task__note">{task.note}</p>
          ) : (
            <p className="task__note task__note--empty">没有备注，点击编辑可补充细节。</p>
          )}

          <div className="task__meta">
            <span className="task__time">
              <Clock3 size={11.5} strokeWidth={2} />
              {formatTaskTime(task.createdAt)}
            </span>
            <span className="meta-spacer" />
            {task.important && (
              <span className="meta-flag meta-flag--important">
                <Flag size={11} strokeWidth={2.2} />
                重要
              </span>
            )}
            {task.urgent && (
              <span className="meta-flag meta-flag--urgent">
                <Zap size={11} strokeWidth={2.2} />
                紧急
              </span>
            )}
          </div>

          <div className="task__actions">
            <button
              type="button"
              className={`text-action focus-action${focused ? ' is-active' : ''}`}
              onClick={focused ? onExitFocus : onFocus}
            >
              <Target size={13.5} strokeWidth={2} />
              {focused ? '退出专注' : '专注模式'}
            </button>
            {!focused && (
              <button type="button" className="text-action" onClick={onEdit}>
                <Pencil size={13} strokeWidth={2} />
                编辑
              </button>
            )}
            <button type="button" className="text-action archive-action" onClick={onArchive}>
              <Archive size={13.5} strokeWidth={2} />
              归档
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
