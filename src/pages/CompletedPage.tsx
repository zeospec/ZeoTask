import { useMemo } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useChores } from '../hooks/useChores'
import type { Chore } from '../types/models'

type ShellContext = {
  openEdit: (chore: Chore) => void
}

/** Gone list only - completed / archived one-shots. */
export function CompletedPage() {
  const { chores, deleteTask } = useChores()
  const { openEdit } = useOutletContext<ShellContext>()

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
                <p className="font-mono-meta text-[11px] text-[var(--muted)]">
                  {chore.archivedAt
                    ? format(parseISO(chore.archivedAt), 'MMM d, yyyy · h:mm a')
                    : ''}
                </p>
              </div>
              <button
                type="button"
                className="focus-ring shrink-0 rounded-lg px-2 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--accent-wash)]"
                onClick={() => openEdit(chore)}
              >
                Edit
              </button>
              <button
                type="button"
                className="focus-ring shrink-0 rounded-lg px-2 py-1.5 text-xs text-[var(--danger)] hover:bg-red-50"
                onClick={() => {
                  if (window.confirm(`Delete “${chore.title}” permanently?`)) {
                    deleteTask(chore.id, chore.title)
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
