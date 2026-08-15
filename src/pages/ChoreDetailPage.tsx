import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, Check, Plus } from '../components/icons'
import { useAuth } from '../hooks/useAuth'
import { useChores } from '../hooks/useChores'
import { useLabels } from '../hooks/useLabels'
import { toggleSubtask, updateChore } from '../lib/chores'
import { sanitizeHtml, isPlainOrEmptyDescription } from '../lib/html'
import { recurrenceSummary } from '../lib/scheduler'
import type { Chore } from '../types/models'

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
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
    setBusy(true)
    runWrite(
      chore.id,
      updateChore(user.uid, chore.id, {
        subtasks: [
          ...chore.subtasks,
          {
            id: crypto.randomUUID(),
            title: subTitle.trim(),
            completed: false,
          },
        ],
      }).finally(() => setBusy(false)),
      'Could not add subtask',
    )
    setSubTitle('')
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
        <ul className="space-y-0.5">
          {chore.subtasks.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 text-left"
                onClick={() => {
                  if (!user) return
                  runWrite(
                    chore.id,
                    toggleSubtask(user.uid, chore, s.id),
                    'Could not update subtask',
                  )
                }}
              >
                <span
                  className={[
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                    s.completed
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--hairline)]',
                  ].join(' ')}
                >
                  {s.completed && <Check size={14} />}
                </span>
                <span
                  className={
                    s.completed
                      ? 'text-[15px] text-[var(--muted)] line-through'
                      : 'text-[15px] text-[var(--ink)]'
                  }
                >
                  {s.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={onAddSubtask}
          className="mt-1 flex min-h-12 items-center gap-3"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--accent)]">
            <Plus size={16} />
          </span>
          <input
            value={subTitle}
            onChange={(e) => setSubTitle(e.target.value)}
            placeholder="Add checklist item"
            disabled={busy}
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[15px] outline-none placeholder:text-[var(--muted)]"
          />
        </form>
      </section>
    </div>
  )
}
