import { useEffect, useRef, useState } from 'react'
import { Check, Flag, Plus, X, Zap } from 'lucide-react'
import type { Note, Task } from '@shared/types'
import { formatNoteDateTitle } from '../utils/date'

export interface ComposerDraft {
  title: string
  body: string
  important: boolean
  urgent: boolean
  titleAuto?: boolean
}

interface ComposerProps {
  mode: 'create' | 'edit'
  kind: 'task' | 'note'
  task?: Task
  note?: Note
  onSubmit: (draft: ComposerDraft) => void
  onCancel: () => void
}

export function Composer({ mode, kind, task, note, onSubmit, onCancel }: ComposerProps) {
  const isNote = kind === 'note'
  const [defaultNoteTitle] = useState(() =>
    kind === 'note' && mode === 'create' ? formatNoteDateTitle(new Date()) : ''
  )
  const [title, setTitle] = useState(task?.title ?? note?.title ?? '')
  const [titleDirty, setTitleDirty] = useState(false)
  const [body, setBody] = useState(task?.note ?? note?.content ?? '')
  const [important, setImportant] = useState(task?.important ?? note?.important ?? false)
  const [urgent, setUrgent] = useState(task?.urgent ?? note?.urgent ?? false)
  const titleRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      titleRef.current?.focus()
      if (mode === 'edit') titleRef.current?.select()
    }, 60)
    return () => window.clearTimeout(timer)
  }, [mode, task?.id, note?.id])

  function submit(): void {
    const trimmedTitle = title.trim()
    const resolvedTitle = trimmedTitle || (isNote && mode === 'create' ? defaultNoteTitle : '')
    if (!resolvedTitle) {
      titleRef.current?.focus()
      return
    }
    const autoTitle = isNote
      ? mode === 'create'
        ? !trimmedTitle
        : !titleDirty && note?.titleAuto === true
      : false
    onSubmit({
      title: resolvedTitle,
      body: body.trim(),
      important,
      urgent,
      titleAuto: autoTitle
    })
  }

  const heading = `${mode === 'create' ? '新建' : '编辑'}${isNote ? '随记' : '任务'}`
  const titlePlaceholder = isNote
    ? mode === 'create'
      ? defaultNoteTitle
      : '给这条随想起个标题…'
    : '写下要做的事…'
  const bodyPlaceholder = isNote ? '写点什么…' : '添加备注（可选）'
  const canSubmit = isNote && mode === 'create' ? true : Boolean(title.trim())

  return (
    <form
      ref={formRef}
      className={`composer${isNote ? ' composer--note' : ''}`}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="composer__heading">
        <span className="composer__label">{heading}</span>
        <button
          type="button"
          className="icon-button icon-button--small"
          onClick={onCancel}
          aria-label="关闭编辑"
          title="关闭"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <input
        ref={titleRef}
        className="composer__title"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value)
          setTitleDirty(true)
        }}
        placeholder={titlePlaceholder}
        aria-label={isNote ? '随记标题' : '任务标题'}
        maxLength={300}
        autoComplete="off"
      />

      <textarea
        className="composer__note"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            formRef.current?.requestSubmit()
          }
        }}
        placeholder={bodyPlaceholder}
        aria-label={isNote ? '随记内容' : '任务备注'}
        maxLength={20_000}
        rows={1}
      />

      <div className="composer__footer">
        <div className="flag-group" aria-label={isNote ? '随记标记' : '任务标记'}>
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

        <div className="composer__submit-group">
          <button type="submit" className="composer__submit" disabled={!canSubmit}>
            {mode === 'create' ? <Plus size={14} /> : <Check size={14} />}
            {mode === 'create' ? '添加' : '保存'}
          </button>
        </div>
      </div>
    </form>
  )
}
