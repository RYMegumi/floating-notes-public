import { Target, X } from 'lucide-react'

interface FocusBannerProps {
  title: string
  onExit: () => void
}

export function FocusBanner({ title, onExit }: FocusBannerProps) {
  return (
    <div className="focus-banner" role="status" aria-live="polite">
      <span className="focus-banner__pulse" aria-hidden="true" />
      <Target size={13.5} strokeWidth={2.2} className="focus-banner__icon" aria-hidden="true" />
      <span className="focus-banner__label">专注中</span>
      <span className="focus-banner__title" title={title}>
        {title}
      </span>
      <button
        type="button"
        className="focus-banner__exit"
        onClick={onExit}
        aria-label="退出专注模式"
        title="退出专注模式"
      >
        <X size={12.5} strokeWidth={2.2} />
        退出
      </button>
    </div>
  )
}
