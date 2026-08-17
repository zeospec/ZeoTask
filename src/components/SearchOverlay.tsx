import { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Search } from './icons'
import { useChores } from '../hooks/useChores'
import { useLabels } from '../hooks/useLabels'
import type { Chore } from '../types/models'

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (chore: Chore) => void
}

export function SearchOverlay({ open, onClose, onSelect }: Props) {
  const { chores } = useChores()
  const { byId } = useLabels()
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    const t = window.setTimeout(() => inputRef.current?.focus(), 20)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const results = useMemo(() => {
    const openTasks = chores.filter((c) => !c.archivedAt)
    const query = q.trim().toLowerCase()
    if (!query) {
      return [...openTasks]
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        .slice(0, 12)
    }
    return openTasks.filter((c) => {
      const labelText = c.labelIds
        .map((id) => byId.get(id)?.name ?? '')
        .join(' ')
        .toLowerCase()
      return (
        c.title.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query) ||
        labelText.includes(query)
      )
    })
  }, [byId, chores, q])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[var(--ink)]/30 p-4 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close search"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search tasks"
        className="modal-panel relative z-10 w-full max-w-lg overflow-hidden rounded-[var(--radius-modal)] border border-[var(--hairline)] bg-[var(--surface)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--hairline)] px-4">
          <Search size={18} className="text-[var(--muted)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks…"
            className="w-full py-3.5 text-[15px] outline-none"
          />
        </div>
        <ul className="max-h-[50dvh] divide-y divide-[var(--hairline)] overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-4 py-5 text-sm text-[var(--muted)]">No matches</li>
          ) : (
            results.map((chore) => (
              <li key={chore.id}>
                <button
                  type="button"
                  className="focus-ring flex w-full flex-col gap-0.5 px-4 py-3.5 text-left hover:bg-[var(--quiet)]"
                  onClick={() => {
                    onSelect(chore)
                    onClose()
                  }}
                >
                  <span className="text-[15px] font-medium text-[var(--ink)]">
                    {chore.title}
                  </span>
                  <span className="font-mono-meta text-[11px] text-[var(--muted)]">
                    {chore.dueAt
                      ? format(parseISO(chore.dueAt), 'MMM d · h:mm a')
                      : 'No due date'}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-[var(--hairline)] px-4 py-2 font-mono-meta text-[11px] text-[var(--muted)]">
          Esc to close · ⌘F · tap to edit
        </p>
      </div>
    </div>
  )
}
