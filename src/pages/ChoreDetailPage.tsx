import { useMemo, useState, useRef, type FormEvent } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { format, parseISO, isToday, isTomorrow } from 'date-fns'
import { ArrowLeft, Check, Plus, X, Pencil, Trash, CalendarIcon } from '../components/icons'
import { DueDatePicker } from '../components/DueDatePicker'
import { SmartTaskTitleInput } from '../components/SmartTaskTitleInput'
import { useAuth } from '../hooks/useAuth'
import { useChores } from '../hooks/useChores'
import { useLabels } from '../hooks/useLabels'
import { toggleSubtask, updateChore, updateSubtask, deleteSubtask } from '../lib/chores'
import { parseSubtaskTitle } from '../lib/taskParsers'
import { sanitizeHtml, isPlainOrEmptyDescription } from '../lib/html'
import { recurrenceSummary } from '../lib/scheduler'
import type { Chore, Subtask } from '../types/models'

type ShellContext = {
  openEdit: (chore: Chore) => void
  openCreate?: () => void
}

export function ChoreDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { chores, completeTask, deleteTask, runWrite } = useChores()
  const { byId } = useLabels()
  const { openEdit } = useOutletContext<ShellContext>()
  const navigate = useNavigate()
  const chore = useMemo(() => chores.find((c) => c.id === id), [chores, id])
  const [subTitle, setSubTitle] = useState('')
  const [subDue, setSubDue] = useState<string | null>(null)
  const [subDatePickerTarget, setSubDatePickerTarget] = useState<'draft' | string | null>(null)
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null)
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('')
  const [editingSubtaskDue, setEditingSubtaskDue] = useState<string | null>(null)
  const [confirmDeleteSubtaskId, setConfirmDeleteSubtaskId] = useState<string | null>(null)
  const subEditorRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const subTitleNlp = useMemo(() => parseSubtaskTitle(subTitle), [subTitle])
  const effectiveSubDue =
    subDue || (subTitleNlp.dueAt ? subTitleNlp.dueAt.toISOString() : null)

  const editingSubtaskNlp = useMemo(
    () => parseSubtaskTitle(editingSubtaskTitle),
    [editingSubtaskTitle],
  )
  const effectiveEditingSubtaskDue =
    editingSubtaskDue ||
    (editingSubtaskNlp.dueAt ? editingSubtaskNlp.dueAt.toISOString() : null)

  if (!chore) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Task not found.{' '}
        <Link to="/" className="text-[var(--accent)]">
          Back
        </Link>
      </p>
    )
  }

  const labels = chore.labelIds
    .map((lid) => byId.get(lid))
    .filter(Boolean)
  const doneCount = chore.subtasks.filter((s) => s.completed).length

  function onAddSubtask(e: FormEvent) {
    e.preventDefault()
    if (!user || !subTitle.trim() || !chore) return
    const id = crypto.randomUUID()
    const parsed = parseSubtaskTitle(subTitle)
    const finalTitle = subDue ? subTitle.trim() : (parsed.cleanedTitle || subTitle.trim())
    const finalDue = subDue || (parsed.dueAt ? parsed.dueAt.toISOString() : null)

    setBusy(true)
    runWrite(
      chore.id,
      updateChore(user.uid, chore.id, {
        subtasks: [
          ...chore.subtasks,
          {
            id,
            title: finalTitle,
            completed: false,
            dueAt: finalDue,
          },
        ],
      }).finally(() => {
        setBusy(false)
        setRecentlyAddedId(id)
        window.setTimeout(() => setRecentlyAddedId(null), 1400)
        requestAnimationFrame(() => subEditorRef.current?.focus())
      }),
      'Could not add subtask',
    )
    setSubTitle('')
    setSubDue(null)
  }

  function startEditSubtask(s: Subtask) {
    setEditingSubtaskId(s.id)
    setEditingSubtaskTitle(s.title)
    setEditingSubtaskDue(s.dueAt || null)
  }

  function saveEditSubtask(sId: string) {
    if (!user || !chore) return
    const trimmed = editingSubtaskTitle.trim()
    if (!trimmed) return
    const parsed = parseSubtaskTitle(trimmed)
    const finalTitle = editingSubtaskDue ? trimmed : (parsed.cleanedTitle || trimmed)
    const finalDue =
      editingSubtaskDue || (parsed.dueAt ? parsed.dueAt.toISOString() : null)

    runWrite(
      chore.id,
      updateSubtask(user.uid, chore, sId, {
        title: finalTitle,
        dueAt: finalDue,
      }),
      'Could not update checklist item',
    )
    setEditingSubtaskId(null)
    setEditingSubtaskTitle('')
    setEditingSubtaskDue(null)
  }

  function deleteSubtaskAction(sId: string) {
    if (!user || !chore) return
    runWrite(
      chore.id,
      deleteSubtask(user.uid, chore, sId),
      'Could not remove checklist item',
    )
  }

  return (
    <div className="pb-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          to="/"
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)]"
        >
          <ArrowLeft size={18} />
          Tasks
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="focus-ring rounded-lg px-3 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-wash)]"
            onClick={() => openEdit(chore)}
          >
            Edit
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                className="focus-ring rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--quiet)]"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </button>
              <button
                type="button"
                className="focus-ring rounded-lg bg-[var(--danger)] px-3 py-2 text-sm text-white"
                onClick={() => {
                  deleteTask(chore.id, chore.title)
                  navigate('/')
                }}
              >
                Delete
              </button>
            </>
          ) : (
            <button
              type="button"
              className="focus-ring rounded-lg px-3 py-2 text-sm text-[var(--danger)] hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <p className="font-mono-meta text-xs uppercase tracking-widest text-[var(--muted)]">
        {chore.dueAt
          ? format(parseISO(chore.dueAt), 'EEE · h:mm a')
          : 'No due date'}
        {chore.frequency !== 'once' &&
          chore.frequency !== 'no_repeat' &&
          ` · ${recurrenceSummary(chore.frequency, chore.repeatEvery, chore.repeatWeekdays)}`}
      </p>

      <div className="mt-4 flex items-start gap-4">
        <button
          type="button"
          aria-label={`Complete ${chore.title}`}
          className="focus-ring mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
          onClick={() => {
            completeTask(chore)
            navigate('/')
          }}
        >
          <Check size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
            {chore.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {chore.dueAt && (
              <span className="rounded-full bg-[var(--accent-wash)] px-3 py-1.5 font-mono-meta text-xs text-[var(--accent)]">
                {format(parseISO(chore.dueAt), 'EEE · h:mm a')}
              </span>
            )}
            {labels.map((l) => (
              <span
                key={l!.id}
                className="rounded-full bg-[var(--quiet)] px-3 py-1.5 font-mono-meta text-xs text-[var(--ink)]"
              >
                {l!.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {chore.description && !isPlainOrEmptyDescription(chore.description) && (
        <section className="mt-8">
          <h2 className="mb-2 text-[13px] font-medium text-[var(--muted)]">Notes</h2>
          <div
            className="max-w-2xl text-[15px] leading-7 text-[var(--ink)]/85 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(chore.description) }}
          />
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium text-[var(--muted)]">Checklist</h2>
          {chore.subtasks.length > 0 && (
            <span className="font-mono-meta text-xs text-[var(--muted)]">
              {doneCount} / {chore.subtasks.length}
            </span>
          )}
        </div>
        <ul className="space-y-1">
          {chore.subtasks.map((s) => {
            const isEditingThis = editingSubtaskId === s.id
            const sDate = s.dueAt ? parseISO(s.dueAt) : null

            if (isEditingThis) {
              return (
                <li key={s.id} className="rounded-lg border border-[var(--accent)]/40 bg-[var(--surface)] p-2 shadow-xs">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 rounded-md border border-[var(--hairline)] bg-transparent focus-within:border-[var(--accent)]">
                      <SmartTaskTitleInput
                        value={editingSubtaskTitle}
                        onChange={setEditingSubtaskTitle}
                        onSubmit={() => saveEditSubtask(s.id)}
                        onEscape={() => setEditingSubtaskId(null)}
                        highlights={editingSubtaskNlp.highlights}
                        placeholder="Item name..."
                        autoFocus
                        className="box-border w-full border-0 bg-transparent px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none min-h-[1.5rem] whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--muted)] empty:before:font-normal empty:before:pointer-events-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSubDatePickerTarget(s.id)}
                      className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs shrink-0 transition-colors ${
                        effectiveEditingSubtaskDue
                          ? 'border-[var(--accent)]/30 bg-[var(--accent-wash)] text-[var(--accent)] font-medium'
                          : 'border-[var(--hairline)] text-[var(--muted)] hover:bg-[var(--quiet)]'
                      }`}
                      title={
                        editingSubtaskNlp.dueAt && !editingSubtaskDue
                          ? `Auto-detected from text: "${editingSubtaskNlp.dueText}"`
                          : 'Set due date'
                      }
                    >
                      <CalendarIcon size={13} />
                      {effectiveEditingSubtaskDue
                        ? format(parseISO(effectiveEditingSubtaskDue), 'MMM d')
                        : 'Due date'}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEditSubtask(s.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-pressed)] shrink-0"
                      title="Save"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSubtaskId(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--quiet)] shrink-0"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </li>
              )
            }

            return (
              <li
                key={s.id}
                className={[
                  'group flex min-h-10 items-center gap-2.5 rounded-lg px-1 py-1 transition-colors',
                  recentlyAddedId === s.id
                    ? 'bg-[var(--accent-wash)] ring-1 ring-[var(--accent)]/20'
                    : 'hover:bg-[var(--quiet)]/50',
                ].join(' ')}
              >
                <button
                  type="button"
                  aria-label={s.completed ? 'Mark incomplete' : 'Mark complete'}
                  onClick={() => {
                    if (!user) return
                    runWrite(
                      chore.id,
                      toggleSubtask(user.uid, chore, s.id),
                      'Could not update subtask',
                    )
                  }}
                  className={[
                    'focus-ring flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    s.completed
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--hairline)] hover:border-[var(--accent)]',
                  ].join(' ')}
                >
                  {s.completed && <Check size={10} />}
                </button>

                <div
                  onClick={() => startEditSubtask(s)}
                  className="min-w-0 flex-1 cursor-pointer py-1"
                  title="Click to edit"
                >
                  <span
                    className={[
                      'text-[14.5px] leading-5',
                      s.completed
                        ? 'text-[var(--muted)] line-through'
                        : 'text-[var(--ink)]',
                    ].join(' ')}
                  >
                    {s.title}
                  </span>
                  {sDate && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-[var(--quiet)] px-1.5 py-0.5 font-mono-meta text-[10.5px] font-medium text-[var(--accent)]">
                      <CalendarIcon size={10} />
                      {isToday(sDate)
                        ? 'Today'
                        : isTomorrow(sDate)
                        ? 'Tomorrow'
                        : format(sDate, 'MMM d')}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {confirmDeleteSubtaskId === s.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          deleteSubtaskAction(s.id)
                          setConfirmDeleteSubtaskId(null)
                        }}
                        className="rounded bg-[var(--danger)] px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-600 transition"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteSubtaskId(null)}
                        className="rounded px-1.5 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--quiet)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label="Edit checklist item"
                        onClick={() => startEditSubtask(s)}
                        className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)]"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove checklist item"
                        className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] hover:bg-red-50 hover:text-[var(--danger)]"
                        onClick={() => setConfirmDeleteSubtaskId(s.id)}
                      >
                        <Trash size={13} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {/* Add checklist item form */}
        <form
          onSubmit={onAddSubtask}
          className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-1.5 pl-2.5 transition-colors focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)]/20"
        >
          <Plus size={16} className="text-[var(--muted)] shrink-0" />
          <div className="min-w-0 flex-1">
            <SmartTaskTitleInput
              inputRef={subEditorRef}
              value={subTitle}
              onChange={setSubTitle}
              onSubmit={() => {
                if (subTitle.trim() && !busy) {
                  onAddSubtask({ preventDefault: () => {} } as FormEvent)
                }
              }}
              highlights={subTitleNlp.highlights}
              placeholder="Add checklist item..."
              autoFocus={false}
              className="box-border w-full border-0 bg-transparent py-1 text-sm text-[var(--ink)] outline-none min-h-[1.5rem] whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--muted)] empty:before:font-normal empty:before:pointer-events-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setSubDatePickerTarget('draft')}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-mono-meta text-xs shrink-0 transition ${
              effectiveSubDue
                ? 'bg-[var(--accent-wash)] text-[var(--accent)] font-medium ring-1 ring-[var(--accent)]/30'
                : 'text-[var(--muted)] hover:bg-[var(--quiet)]'
            }`}
            title={
              subTitleNlp.dueAt && !subDue
                ? `Auto-detected from text: "${subTitleNlp.dueText}"`
                : 'Assign due date to this checklist item'
            }
          >
            <CalendarIcon size={13} />
            {effectiveSubDue ? format(parseISO(effectiveSubDue), 'MMM d') : 'Date'}
          </button>

          <button
            type="submit"
            disabled={!subTitle.trim() || busy}
            className="focus-ring flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--accent-pressed)] disabled:opacity-40 disabled:pointer-events-none shrink-0"
          >
            Add
          </button>
        </form>
      </section>

      {subDatePickerTarget && (
        <DueDatePicker
          value={
            subDatePickerTarget === 'draft'
              ? subDue
                ? parseISO(subDue)
                : chore.dueAt
                ? parseISO(chore.dueAt)
                : new Date()
              : (() => {
                  const s = chore.subtasks.find((x) => x.id === subDatePickerTarget)
                  return s?.dueAt ? parseISO(s.dueAt) : null
                })()
          }
          onClose={() => setSubDatePickerTarget(null)}
          onApply={(date) => {
            if (subDatePickerTarget === 'draft') {
              setSubDue(date ? date.toISOString() : null)
            } else if (subDatePickerTarget) {
              const targetId = subDatePickerTarget
              setEditingSubtaskDue(date ? date.toISOString() : null)
              if (user) {
                runWrite(
                  chore.id,
                  updateSubtask(user.uid, chore, targetId, {
                    dueAt: date ? date.toISOString() : null,
                  }),
                  'Could not update checklist item due date',
                )
              }
            }
            setSubDatePickerTarget(null)
          }}
        />
      )}
    </div>
  )
}
