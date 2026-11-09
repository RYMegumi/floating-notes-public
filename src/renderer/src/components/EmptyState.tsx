import { Plus, Sparkles } from 'lucide-react'

interface EmptyStateProps {
  onAdd: () => void
  title?: string
  hint?: string
  actionLabel?: string
}

export function EmptyState({
  onAdd,
  title = '今天还没有安排',
  hint = '把第一件想做的事写下来吧。',
  actionLabel = '添加第一个任务'
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__art" aria-hidden="true">
        <span className="empty-state__halo" />
        <span className="empty-state__sheet empty-state__sheet--back" />
        <span className="empty-state__sheet empty-state__sheet--front">
          <Sparkles size={18} strokeWidth={1.9} />
        </span>
      </div>
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__hint">{hint}</p>
      <button type="button" className="empty-state__button" onClick={onAdd}>
        <Plus size={14} strokeWidth={2.3} />
        {actionLabel}
      </button>
    </div>
  )
}
