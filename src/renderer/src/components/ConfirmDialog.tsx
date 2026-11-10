import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const { t } = useI18n()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return createPortal(
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
      >
        <div className="confirm-dialog__icon" aria-hidden="true">
          <Trash2 size={18} strokeWidth={1.9} />
        </div>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{description}</p>
        <div className="confirm-dialog__actions">
          <button ref={cancelRef} type="button" className="ghost-button" onClick={onCancel}>
            {t('取消')}
          </button>
          <button type="button" className="danger-button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
