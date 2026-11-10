import { Plus, Sparkles } from 'lucide-react'
import { useI18n } from '../i18n'

interface EmptyStateProps {
  onAdd: () => void
  title?: string
  hint?: string
  actionLabel?: string
}

export function EmptyState({ onAdd, title, hint, actionLabel }: EmptyStateProps) {
  const { t } = useI18n()
  const resolvedTitle = title ?? t('今天还没有安排')
  const resolvedHint = hint ?? t('把第一件想做的事写下来吧。')
  const resolvedAction = actionLabel ?? t('添加第一个任务')

  return (
    <div className="empty-state">
      <div className="empty-state__art" aria-hidden="true">
        <span className="empty-state__halo" />
        <span className="empty-state__sheet empty-state__sheet--back" />
        <span className="empty-state__sheet empty-state__sheet--front">
          <Sparkles size={18} strokeWidth={1.9} />
        </span>
      </div>
      <p className="empty-state__title">{resolvedTitle}</p>
      <p className="empty-state__hint">{resolvedHint}</p>
      <button type="button" className="empty-state__button" onClick={onAdd}>
        <Plus size={14} strokeWidth={2.3} />
        {resolvedAction}
      </button>
    </div>
  )
}
