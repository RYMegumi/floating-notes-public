import {
  Archive,
  ChevronDown,
  Clock3,
  Flag,
  LoaderCircle,
  Pencil,
  Sparkles,
  Tags,
  Zap
} from 'lucide-react'
import type { MouseEvent } from 'react'
import type { Note } from '@shared/types'
import { PRIORITY_LABELS, priorityTier } from '@shared/sort'
import { useI18n } from '../i18n'
import { formatTaskTime } from '../utils/date'
import { NoteInlineEditor, type NoteEditDraft } from './NoteInlineEditor'
import { NoteKeywordsEditor } from './NoteKeywordsEditor'

interface NoteItemProps {
  note: Note
  expanded: boolean
  isNew: boolean
  generating: boolean
  editing: boolean
  initialEditFocus: 'title' | 'content'
  initialCaret?: number
  editingKeywords: boolean
  onToggle: () => void
  onStartEdit: (focus: 'title' | 'content', caret?: number) => void
  onCancelEdit: () => void
  onSaveEdit: (draft: NoteEditDraft) => void
  onGenerate: () => void
  onEditKeywords: () => void
  onSaveKeywords: (keywords: string[]) => void
  onCancelKeywords: () => void
  onArchive: () => void
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
}

export function NoteItem({
  note,
  expanded,
  isNew,
  generating,
  editing,
  initialEditFocus,
  initialCaret,
  editingKeywords,
  onToggle,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onGenerate,
  onEditKeywords,
  onSaveKeywords,
  onCancelKeywords,
  onArchive,
  onContextMenu
}: NoteItemProps) {
  const { language, t } = useI18n()
  const tier = priorityTier(note)
  const priority = t(PRIORITY_LABELS[tier])
  const keywordText = note.keywords.join(' · ')

  function handleContentDoubleClick(event: MouseEvent<HTMLParagraphElement>): void {
    const element = event.currentTarget
    let offset = 0
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY)
    if (range && element.contains(range.startContainer)) {
      const prefix = document.createRange()
      prefix.selectNodeContents(element)
      prefix.setEnd(range.startContainer, range.startOffset)
      offset = prefix.toString().length
    }
    onStartEdit('content', offset)
  }

  if (editing) {
    return (
      <article
        className="task note note--editing"
        data-note-id={note.id}
        onContextMenu={onContextMenu}
      >
        <NoteInlineEditor
          note={note}
          initialFocus={initialEditFocus}
          {...(initialCaret !== undefined ? { initialCaret } : {})}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      </article>
    )
  }

  return (
    <article
      className={[
        'task',
        'note',
        `task--tier-${tier}`,
        expanded ? 'is-expanded' : '',
        isNew ? 'is-new' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      data-note-id={note.id}
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        className="task__summary"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={
          keywordText
            ? t('{title}，{priority}，关键词：{keywords}', {
                title: note.title,
                priority,
                keywords: keywordText
              })
            : t('{title}，{priority}', { title: note.title, priority })
        }
      >
        <span className={`priority-mark priority-mark--${tier}`} aria-hidden="true">
          <span className="priority-mark__core" />
        </span>
        <span className={`task__title${note.titleAuto ? ' note__title--auto' : ''}`}>
          {note.title}
        </span>
        {keywordText && (
          <span
            className="note__keywords"
            title={t('关键词：{keywords}', { keywords: keywordText })}
          >
            {keywordText}
          </span>
        )}
        <ChevronDown
          className={`task__chevron${expanded ? ' is-open' : ''}`}
          size={15}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="task__detail">
          {note.content ? (
            <p
              className="task__note note__content"
              onDoubleClick={handleContentDoubleClick}
              title={t('双击编辑')}
            >
              {note.content}
            </p>
          ) : (
            <p
              className="task__note task__note--empty note__content"
              onDoubleClick={handleContentDoubleClick}
              title={t('双击编辑')}
            >
              {t('没有正文，双击或点击编辑可补充。')}
            </p>
          )}

          <div className="task__meta">
            <span className="task__time">
              <Clock3 size={11.5} strokeWidth={2} />
              {formatTaskTime(note.createdAt, language)}
            </span>
            <span className="meta-spacer" />
            {note.important && (
              <span className="meta-flag meta-flag--important">
                <Flag size={11} strokeWidth={2.2} />
                {t('重要')}
              </span>
            )}
            {note.urgent && (
              <span className="meta-flag meta-flag--urgent">
                <Zap size={11} strokeWidth={2.2} />
                {t('紧急')}
              </span>
            )}
          </div>

          <div className="task__actions">
            {note.keywords.length === 0 ? (
              <button
                type="button"
                className={`text-action note-keyword-action${generating ? ' is-busy' : ''}`}
                onClick={onGenerate}
                disabled={generating}
              >
                {generating ? (
                  <LoaderCircle className="is-spinning" size={13.5} strokeWidth={2} />
                ) : (
                  <Sparkles size={13.5} strokeWidth={2} />
                )}
                {generating ? t('生成中') : t('生成关键词')}
              </button>
            ) : (
              <button type="button" className="text-action note-keyword-action" onClick={onEditKeywords}>
                <Tags size={13.5} strokeWidth={2} />
                {t('编辑关键词')}
              </button>
            )}
            <button type="button" className="text-action" onClick={() => onStartEdit('title')}>
              <Pencil size={13} strokeWidth={2} />
              {t('编辑')}
            </button>
            <button type="button" className="text-action archive-action" onClick={onArchive}>
              <Archive size={13.5} strokeWidth={2} />
              {t('归档')}
            </button>
          </div>

          {editingKeywords && (
            <NoteKeywordsEditor
              keywords={note.keywords}
              onSave={onSaveKeywords}
              onCancel={onCancelKeywords}
            />
          )}
        </div>
      )}
    </article>
  )
}
