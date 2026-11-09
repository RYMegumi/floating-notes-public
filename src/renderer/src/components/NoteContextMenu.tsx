import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Archive, Pencil, Sparkles, Tags, Trash2 } from 'lucide-react'
import type { Note } from '@shared/types'

interface NoteContextMenuProps {
  note: Note
  x: number
  y: number
  generating: boolean
  onGenerate: () => void
  onEditKeywords: () => void
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
  onClose: () => void
}

export function NoteContextMenu({
  note,
  x,
  y,
  generating,
  onGenerate,
  onEditKeywords,
  onEdit,
  onArchive,
  onDelete,
  onClose
}: NoteContextMenuProps) {
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
      ).filter((item) => !item.disabled)
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
      aria-label={`${note.title} 的操作`}
      style={{
        left: position?.left ?? x,
        top: position?.top ?? y,
        visibility: position ? 'visible' : 'hidden'
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {note.keywords.length === 0 ? (
        <button
          type="button"
          className="context-menu__item"
          role="menuitem"
          disabled={generating}
          onClick={() => {
            onGenerate()
            onClose()
          }}
        >
          <Sparkles size={14.5} />
          {generating ? '生成关键词中…' : '生成关键词'}
        </button>
      ) : (
        <button
          type="button"
          className="context-menu__item"
          role="menuitem"
          onClick={() => {
            onEditKeywords()
            onClose()
          }}
        >
          <Tags size={14.5} />
          编辑关键词
        </button>
      )}
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
        编辑随记
      </button>
      <button
        type="button"
        className="context-menu__item"
        role="menuitem"
        onClick={() => {
          onArchive()
          onClose()
        }}
      >
        <Archive size={14.5} />
        归档随记
      </button>
      <div className="context-menu__separator" role="separator" />
      <button
        type="button"
        className="context-menu__item context-menu__item--danger"
        role="menuitem"
        onClick={() => {
          onDelete()
          onClose()
        }}
      >
        <Trash2 size={14.5} />
        删除随记
      </button>
    </div>,
    document.body
  )
}
