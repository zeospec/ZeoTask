import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { format, isToday, isTomorrow, parseISO, addDays } from 'date-fns'
import { X, CalendarIcon } from './icons'
import { DueDatePicker } from './DueDatePicker'
import { SmartTaskTitleInput } from './SmartTaskTitleInput'
import { parseSubtaskTitle } from '../lib/taskParsers'
import type { Chore } from '../types/models'

type Props = {
  open: boolean
  subtaskChore: Chore | null
  onClose: () => void
  onSave: (subtaskId: string, updates: { title: string; dueAt: string | null }) => void
  onDelete: (subtaskId: string) => void
  onOpenParent?: (parentChoreId: string) => void
}

export function EditSubtaskModal({
  open,
  subtaskChore,
  onClose,
  onSave,
  onDelete,
  onOpenParent,
}: Props) {
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState<string | null>(null)
  const [duePickerOpen, setDuePickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [manualDueChosen, setManualDueChosen] = useState(false)

  const nlpParsed = useMemo(() => parseSubtaskTitle(title), [title])

  useEffect(() => {
    if (subtaskChore && open) {
      setTitle(subtaskChore.title)
      setDueAt(subtaskChore.dueAt)
      setConfirmDelete(false)
      setDuePickerOpen(false)
      setManualDueChosen(false)
    }
  }, [subtaskChore, open])

  if (!open || !subtaskChore || !subtaskChore.subtaskId) return null

  const parentChoreId = subtaskChore.parentChoreId || ''
  const parentTitle = subtaskChore.parentChoreTitle || 'Parent task'

  function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || !subtaskChore?.subtaskId) return
    const parsed = parseSubtaskTitle(trimmed)
    const finalTitle = manualDueChosen ? trimmed : (parsed.cleanedTitle || trimmed)
    const finalDue = manualDueChosen
      ? dueAt
      : (parsed.dueAt ? parsed.dueAt.toISOString() : dueAt)
    onSave(subtaskChore.subtaskId, { title: finalTitle, dueAt: finalDue })
    onClose()
  }

  function handleDelete() {
    if (!subtaskChore?.subtaskId) return
    if (confirmDelete) {
      onDelete(subtaskChore.subtaskId)
      onClose()
    } else {
      setConfirmDelete(true)
    }
  }

  const currentDateObj = dueAt ? parseISO(dueAt) : null
  const formattedDue = currentDateObj
    ? isToday(currentDateObj)
      ? `Today · ${format(currentDateObj, 'h:mm a')}`
      : isTomorrow(currentDateObj)
      ? `Tomorrow · ${format(currentDateObj, 'h:mm a')}`
      : format(currentDateObj, 'MMM d, yyyy · h:mm a')
    : 'No due date'

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full sm:max-w-md sm:rounded-[var(--radius-modal)] rounded-t-[1.25rem] bg-[var(--surface)] shadow-2xl modal-panel overflow-hidden max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--hairline)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono-meta text-[11px] uppercase tracking-widest text-[var(--muted)]">
              Checklist Item
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <span>Part of</span>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  if (parentChoreId) onOpenParent?.(parentChoreId)
                }}
                className="truncate font-semibold text-[var(--ink)] hover:text-[var(--accent)] underline underline-offset-2"
                title={`Open "${parentTitle}"`}
              >
                {parentTitle}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring -mr-2 flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--quiet)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Item Title
            </label>
            <div className="w-full rounded-[var(--radius-control)] border border-[var(--hairline)] bg-[var(--canvas)] px-3.5 py-2.5 transition-colors focus-within:border-[var(--accent)] focus-within:bg-[var(--surface)] focus-within:ring-1 focus-within:ring-[var(--accent)]">
              <SmartTaskTitleInput
                value={title}
                onChange={setTitle}
                onSubmit={handleSave}
                highlights={nlpParsed.highlights}
                placeholder="Checklist item title..."
                autoFocus
                className="box-border w-full border-0 bg-transparent text-base font-medium text-[var(--ink)] outline-none min-h-[1.5rem] whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--muted)] empty:before:font-normal empty:before:pointer-events-none"
              />
            </div>
            {nlpParsed.dueAt && !manualDueChosen && (
              <p className="mt-1.5 flex items-center gap-1.5 font-mono-meta text-xs text-[var(--accent)]">
                <CalendarIcon size={12} />
                <span>Auto-detected: <strong>{format(nlpParsed.dueAt, 'EEE, MMM d')}</strong> (will apply on save)</span>
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Due Date
            </label>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  const d = new Date()
                  d.setHours(23, 59, 59, 0)
                  setDueAt(d.toISOString())
                  setManualDueChosen(true)
                }}
                className={`rounded-full px-3 py-1 font-mono-meta text-xs transition ${
                  currentDateObj && isToday(currentDateObj)
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--quiet)] text-[var(--ink)] hover:bg-[var(--hairline)]'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = addDays(new Date(), 1)
                  d.setHours(23, 59, 59, 0)
                  setDueAt(d.toISOString())
                  setManualDueChosen(true)
                }}
                className={`rounded-full px-3 py-1 font-mono-meta text-xs transition ${
                  currentDateObj && isTomorrow(currentDateObj)
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--quiet)] text-[var(--ink)] hover:bg-[var(--hairline)]'
                }`}
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuePickerOpen(true)
                  setManualDueChosen(true)
                }}
                className={`rounded-full px-3 py-1 font-mono-meta text-xs transition ${
                  dueAt && !isToday(currentDateObj!) && !isTomorrow(currentDateObj!)
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--quiet)] text-[var(--ink)] hover:bg-[var(--hairline)]'
                }`}
              >
                Pick Date…
              </button>
              {dueAt && (
                <button
                  type="button"
                  onClick={() => {
                    setDueAt(null)
                    setManualDueChosen(true)
                  }}
                  className="rounded-full px-2.5 py-1 font-mono-meta text-xs text-[var(--muted)] hover:bg-red-50 hover:text-[var(--danger)] transition"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="font-mono-meta text-xs text-[var(--muted)]">
              Scheduled: <span className="font-medium text-[var(--ink)]">{formattedDue}</span>
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--hairline)] pt-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--danger)]">Delete item?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-lg bg-[var(--danger)] px-2.5 py-1 text-xs font-semibold text-white"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--quiet)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs font-medium text-[var(--danger)] hover:underline"
              >
                Delete item
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="focus-ring rounded-[var(--radius-control)] px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="focus-ring rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-pressed)] disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </div>

      {duePickerOpen && (
        <DueDatePicker
          value={currentDateObj}
          onClose={() => setDuePickerOpen(false)}
          onApply={(date) => {
            setDueAt(date ? date.toISOString() : null)
            setDuePickerOpen(false)
          }}
        />
      )}
    </div>
  )

  return createPortal(modal, document.body)
}
