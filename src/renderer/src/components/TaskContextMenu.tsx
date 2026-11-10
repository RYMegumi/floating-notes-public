import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Archive, Pencil, Target, XCircle } from 'lucide-react'
import type { Task } from '@shared/types'
import { useI18n } from '../i18n'

interface TaskContextMenuProps {
  task: Task
  x: number
  y: number
  focused: boolean
  onFocus: () => void
  onExitFocus: () => void
  onEdit: () => void
  onArchive: () => void
  onClose: () => void
}

export function TaskContextMenu({
  task,
  x,
  y,
  focused,
  onFocus,
  onExitFocus,
  onEdit,
  onArchive,
  onClose
}: TaskContextMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const element = menuRef.current
    if (!element) return
    const margin = 8
    const rect = element.getBoundingClientRect()
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin))
    setPosition({ left, top })
  }, [x, y])

  useEffect(() => {
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
    firstItem?.focus({ preventScroll: true })

    function handlePointerDown(event: PointerEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
      )
      if (items.length === 0) return
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
      const nextIndex =
        event.key === 'ArrowDown'
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length
      items[nextIndex]?.focus()
    }
    function handleBlur(): void {
      onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', handleBlur)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', handleBlur)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={t('{title} 的操作', { title: task.title })}
      style={{
        left: position?.left ?? x,
        top: position?.top ?? y,
        visibility: position ? 'visible' : 'hidden'
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="context-menu__item"
        role="menuitem"
        onClick={() => {
          focused ? onExitFocus() : onFocus()
          onClose()
        }}
      >
        {focused ? <XCircle size={14.5} /> : <Target size={14.5} />}
        {focused ? t('退出专注') : t('进入专注模式')}
      </button>
      {!focused && (
        <button
          type="button"
          className="context-menu__item"
          role="menuitem"
          onClick={() => {
            onEdit()
            onClose()
          }}
        >
          <Pencil size={14.5} />
          {t('编辑任务')}
        </button>
      )}
      <div className="context-menu__separator" role="separator" />
      <button
        type="button"
        className="context-menu__item context-menu__item--archive"
        role="menuitem"
        onClick={() => {
          onArchive()
          onClose()
        }}
      >
        <Archive size={14.5} />
        {t('归档（完成）')}
      </button>
    </div>,
    document.body
  )
}
