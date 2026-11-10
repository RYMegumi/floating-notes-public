import { createPortal } from 'react-dom'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useI18n } from '../i18n'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastMessage {
  id: number
  message: string
  tone: 'success' | 'info' | 'error'
  action?: ToastAction
}

interface ToastProps {
  toast: ToastMessage
  onDismiss: () => void
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const { t } = useI18n()
  const Icon = toast.tone === 'success' ? CircleCheck : toast.tone === 'error' ? CircleAlert : Info

  return createPortal(
    <div className={`toast toast--${toast.tone}`} role="status" aria-live="polite">
      <Icon className="toast__icon" size={15} strokeWidth={2} />
      <span className="toast__message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.action?.onClick()
            onDismiss()
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast__close"
        onClick={onDismiss}
        aria-label={t('关闭提示')}
        title={t('关闭')}
      >
        <X size={12.5} strokeWidth={2.2} />
      </button>
    </div>,
    document.body
  )
}
