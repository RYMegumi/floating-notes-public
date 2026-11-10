import { Target, X } from 'lucide-react'
import { useI18n } from '../i18n'

interface FocusBannerProps {
  title: string
  onExit: () => void
}

export function FocusBanner({ title, onExit }: FocusBannerProps) {
  const { t } = useI18n()
  return (
    <div className="focus-banner" role="status" aria-live="polite">
      <span className="focus-banner__pulse" aria-hidden="true" />
      <Target size={13.5} strokeWidth={2.2} className="focus-banner__icon" aria-hidden="true" />
      <span className="focus-banner__label">{t('专注中')}</span>
      <span className="focus-banner__title" title={title}>
        {title}
      </span>
      <button
        type="button"
        className="focus-banner__exit"
        onClick={onExit}
        aria-label={t('退出专注模式')}
        title={t('退出专注模式')}
      >
        <X size={12.5} strokeWidth={2.2} />
        {t('退出')}
      </button>
    </div>
  )
}
