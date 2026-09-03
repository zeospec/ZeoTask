import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useChores } from '../hooks/useChores'
import type { Chore } from '../types/models'

type ShellContext = {
  openEdit: (chore: Chore) => void
}

/** Gone list only - completed / archived one-shots. */
export function CompletedPage() {
  const { chores, updateTask, deleteTask } = useChores()
  const { openEdit } = useOutletContext<ShellContext>()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const archived = useMemo(
    () =>
      chores
        .filter((c) => c.archivedAt)
        .sort((a, b) => String(b.archivedAt || '').localeCompare(String(a.archivedAt || ''))),
    [chores],
  )

  return (
    <div className="space-y-5 pb-8">
      <Link
        to="/"
        className="inline-flex min-h-11 items-center text-sm text-[var(--muted)] hover:text-[var(--accent)]"
      >
        ← Tasks
      </Link>

      <div>
        <p className="font-mono-meta text-xs uppercase tracking-widest text-[var(--muted)]">
          Archive
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">
          Completed
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          One-shot tasks land here when you complete them. Recurring tasks stay
          on Tasks with a new due date.
        </p>
      </div>

      {archived.length === 0 ? (
        <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--hairline)] px-5 py-10 text-center">
          <p className="text-sm text-[var(--muted)]">Nothing archived yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[var(--radius-control)] border border-[var(--hairline)] bg-[var(--surface)]">
          {archived.map((chore) => (
            <li
              key={chore.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-[var(--ink)]">
                  {chore.title}
                </p>
                <div className="flex items-center gap-2 font-mono-meta text-[11px] text-[var(--muted)]">
                  {chore.archivedAt && (
                    <span>{format(parseISO(chore.archivedAt), 'MMM d, yyyy · h:mm a')}</span>
                  )}
                  {chore.subtasks && chore.subtasks.length > 0 && (
                    <span>
                      · {chore.subtasks.filter((s) => s.completed).length}/{chore.subtasks.length} checklist
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="focus-ring shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-wash)]"
                onClick={() => updateTask(chore.id, { archivedAt: null })}
              >
                Restore
              </button>
              <button
                type="button"
                className="focus-ring shrink-0 rounded-lg px-2 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)]"
                onClick={() => openEdit(chore)}
              >
                Edit
              </button>
              {confirmDeleteId === chore.id ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="focus-ring rounded-lg bg-[var(--danger)] px-2 py-1 text-xs font-semibold text-white hover:bg-red-600 transition"
                    onClick={() => {
                      deleteTask(chore.id, chore.title)
                      setConfirmDeleteId(null)
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="focus-ring rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--quiet)]"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="focus-ring shrink-0 rounded-lg px-2 py-1.5 text-xs text-[var(--danger)] hover:bg-red-50 transition"
                  onClick={() => setConfirmDeleteId(chore.id)}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
