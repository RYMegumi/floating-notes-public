import { useEffect, useRef, useState } from 'react'

interface NoteKeywordsEditorProps {
  keywords: string[]
  onSave: (keywords: string[]) => void
  onCancel: () => void
}

export function NoteKeywordsEditor({ keywords, onSave, onCancel }: NoteKeywordsEditorProps) {
  const [value, setValue] = useState(keywords.join('、'))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function submit(): void {
    const seen = new Set<string>()
    const next: string[] = []
    for (const item of value.split(/[，,、;；\s]+/)) {
      const keyword = item.trim().replace(/^#+/, '').slice(0, 16)
      if (!keyword || seen.has(keyword)) continue
      seen.add(keyword)
      next.push(keyword)
      if (next.length >= 8) break
    }
    onSave(next)
  }

  return (
    <form
      className="note-keywords-editor"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    >
      <input
        ref={inputRef}
        className="note-keywords-editor__input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="用顿号或逗号分隔关键词"
        aria-label="编辑关键词"
        maxLength={160}
        autoComplete="off"
      />
      <button type="submit" className="note-keywords-editor__save">
        保存
      </button>
      <button type="button" className="note-keywords-editor__cancel" onClick={onCancel}>
        取消
      </button>
    </form>
  )
}
