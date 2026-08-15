import { useState, useEffect } from 'react'
import { Filter, X, Check } from './icons'
import { useLabels } from '../hooks/useLabels'
import { useViews } from '../hooks/useViews'
import type { Priority } from '../types/models'

export type FilterState = {
  viewId?: string
  name?: string
  priorities: Priority[]
  labelIds: string[]
}

type Props = {
  activeFilter: FilterState | null
  onChange: (f: FilterState | null) => void
}

export function FilterMenu({ activeFilter, onChange }: Props) {
  const { labels } = useLabels()
  const { views, create, remove } = useViews()
  const [open, setOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Local state for the popover (ad-hoc filtering)
  const [localPriorities, setLocalPriorities] = useState<Priority[]>([])
  const [localLabels, setLocalLabels] = useState<string[]>([])

  // Sync local state when active filter changes
  useEffect(() => {
    if (activeFilter) {
      setLocalPriorities(activeFilter.priorities)
      setLocalLabels(activeFilter.labelIds)
    } else {
      setLocalPriorities([])
      setLocalLabels([])
    }
  }, [activeFilter])

  const hasAdhocChanges =
    (!activeFilter?.viewId && (localPriorities.length > 0 || localLabels.length > 0)) ||
    (activeFilter?.viewId &&
      (JSON.stringify(localPriorities) !== JSON.stringify(activeFilter.priorities) ||
        JSON.stringify(localLabels) !== JSON.stringify(activeFilter.labelIds)))

  const applyLocal = (p: Priority[], l: string[]) => {
    if (p.length === 0 && l.length === 0) {
      onChange(null)
    } else {
      onChange({ priorities: p, labelIds: l })
    }
  }

  const togglePriority = (p: Priority) => {
    const next = localPriorities.includes(p)
      ? localPriorities.filter((x) => x !== p)
      : [...localPriorities, p].sort()
    setLocalPriorities(next)
    applyLocal(next, localLabels)
  }

  const toggleLabel = (lId: string) => {
    const next = localLabels.includes(lId)
      ? localLabels.filter((x) => x !== lId)
      : [...localLabels, lId]
    setLocalLabels(next)
    applyLocal(localPriorities, next)
  }

  const handleSaveView = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draftName.trim() || localPriorities.length === 0 && localLabels.length === 0) return
    const id = await create(draftName.trim(), localPriorities, localLabels)
    onChange({ viewId: id, name: draftName.trim(), priorities: localPriorities, labelIds: localLabels })
    setIsSaving(false)
    setDraftName('')
    setOpen(false)
  }

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'focus-ring flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)]',
          activeFilter
            ? 'bg-[var(--accent-wash)] text-[var(--accent)]'
            : 'text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)]',
        ].join(' ')}
        aria-label="Filter"
      >
        <Filter size={20} />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full right-0 z-50 mt-2 w-72 overflow-hidden rounded-[var(--radius-control)] border border-[var(--hairline)] bg-[var(--surface)] py-2 shadow-[var(--shadow-card)] max-h-[70vh] flex flex-col">
            
            {views.length > 0 && (
              <div className="mb-2">
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Saved Views
                </div>
                {views.map((v) => (
                  <div key={v.id} className="group flex items-center justify-between px-3 py-1.5 hover:bg-[var(--quiet)]">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center text-sm text-[var(--ink)]"
                      onClick={() => {
                        onChange({ viewId: v.id, name: v.name, priorities: v.priorities, labelIds: v.labelIds })
                        setOpen(false)
                      }}
                    >
                      <span className="truncate text-left font-medium">{v.name}</span>
                      {activeFilter?.viewId === v.id && (
                        <Check size={14} className="ml-2 text-[var(--accent)] shrink-0" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="ml-2 rounded p-1 text-[var(--muted)] opacity-0 hover:bg-[var(--line)] hover:text-[var(--danger)] group-hover:opacity-100"
                      onClick={() => remove(v.id)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <div className="mx-3 my-2 border-t border-[var(--hairline)]" />
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-3">
              <div className="mb-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Priorities
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4].map((p) => {
                    const active = localPriorities.includes(p as Priority)
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePriority(p as Priority)}
                        className={[
                          'rounded-full px-2.5 py-1 text-xs font-medium',
                          active
                            ? 'bg-[var(--due-soon)] text-white'
                            : 'bg-[var(--quiet)] text-[var(--ink)] hover:bg-[var(--line)]',
                        ].join(' ')}
                      >
                        P{p}
                      </button>
                    )
                  })}
                </div>
              </div>

              {labels.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Labels
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map((l) => {
                      const active = localLabels.includes(l.id)
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => toggleLabel(l.id)}
                          className={[
                            'rounded-full px-2.5 py-1 text-xs font-medium',
                            active
                              ? 'bg-[var(--ink)] text-white'
                              : 'bg-[var(--quiet)] text-[var(--ink)] hover:bg-[var(--line)]',
                          ].join(' ')}
                        >
                          #{l.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {hasAdhocChanges && !isSaving && (
              <div className="border-t border-[var(--hairline)] p-2">
                <button
                  type="button"
                  onClick={() => setIsSaving(true)}
                  className="w-full rounded-lg bg-[var(--quiet)] py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--line)]"
                >
                  Save as Custom View
                </button>
              </div>
            )}

            {isSaving && (
              <form onSubmit={handleSaveView} className="border-t border-[var(--hairline)] p-2">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="View name..."
                  className="mb-2 w-full rounded-lg border border-[var(--hairline)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSaving(false)}
                    className="flex-1 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--quiet)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!draftName.trim()}
                    className="flex-1 rounded-lg bg-[var(--accent)] px-2 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}
            
            {activeFilter && !hasAdhocChanges && !activeFilter.viewId && (
              <div className="border-t border-[var(--hairline)] p-2">
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  className="w-full rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--danger)] hover:bg-[var(--quiet)]"
                >
                  Clear filter
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
