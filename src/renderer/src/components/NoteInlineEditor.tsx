import { useLayoutEffect, useRef, useState } from 'react'
import { Check, Flag, X, Zap } from 'lucide-react'
import type { Note } from '@shared/types'

export interface NoteEditDraft {
  title: string
  content: string
  important: boolean
  urgent: boolean
  titleAuto: boolean
}

interface NoteInlineEditorProps {
  note: Note
  initialFocus: 'title' | 'content'
  initialCaret?: number
  onSave: (draft: NoteEditDraft) => void
  onCancel: () => void
}

export function NoteInlineEditor({
  note,
  initialFocus,
  initialCaret,
  onSave,
  onCancel
}: NoteInlineEditorProps) {
  const [title, setTitle] = useState(note.title)
  const [titleDirty, setTitleDirty] = useState(false)
  const [content, setContent] = useState(note.content)
  const [important, setImportant] = useState(note.important)
  const [urgent, setUrgent] = useState(note.urgent)
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  function resizeContent(): void {
    const element = contentRef.current
    if (!element) return
    const min = 160
    const max = 420
    const height = Math.max(min, Math.min(max, element.scrollHeight))
    element.style.height = `${height}px`
    element.style.overflowY = element.scrollHeight > max ? 'auto' : 'hidden'
  }

  useLayoutEffect(() => {
    resizeContent()
    if (initialFocus === 'content') {
      const element = contentRef.current
      if (!element) return
      element.focus()
      const position = Math.min(Math.max(initialCaret ?? element.value.length, 0), element.value.length)
      element.setSelectionRange(position, position)
    } else {
      titleRef.current?.focus()
      titleRef.current?.select()
    }
    // The editor is keyed by note id; focus should only be applied on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    resizeContent()
  }, [content])

  function submit(): void {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      titleRef.current?.focus()
      return
    }
    onSave({
      title: trimmedTitle,
      content: content.trim(),
      important,
      urgent,
      titleAuto: titleDirty ? false : note.titleAuto === true
    })
  }

  return (
    <form
      className="note-editor"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          submit()
        }
      }}
    >
      <div className="note-editor__heading">
        <span className="composer__label">编辑随记</span>
        <button
          type="button"
          className="icon-button icon-button--small"
          onClick={onCancel}
          aria-label="取消编辑"
          title="取消"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <input
        ref={titleRef}
        className="note-editor__title"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value)
          setTitleDirty(true)
        }}
        placeholder="给这条随想起个标题…"
        aria-label="随记标题"
        maxLength={300}
        autoComplete="off"
      />

      <textarea
        ref={contentRef}
        className="note-editor__content"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="写点什么…"
        aria-label="随记内容"
        maxLength={20_000}
        spellCheck={false}
      />

      <div className="note-editor__footer">
        <div className="flag-group" aria-label="随记标记">
          <button
            type="button"
            className={`flag-toggle flag-toggle--important${important ? ' is-active' : ''}`}
            onClick={() => setImportant((value) => !value)}
            aria-pressed={important}
          >
            <Flag size={12.5} strokeWidth={2.2} />
            重要
          </button>
          <button
            type="button"
            className={`flag-toggle flag-toggle--urgent${urgent ? ' is-active' : ''}`}
            onClick={() => setUrgent((value) => !value)}
            aria-pressed={urgent}
          >
            <Zap size={12.5} strokeWidth={2.2} />
            紧急
          </button>
        </div>

        <div className="note-editor__actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="composer__submit" disabled={!title.trim()}>
            <Check size={14} />
            保存
          </button>
        </div>
      </div>
    </form>
  )
}
