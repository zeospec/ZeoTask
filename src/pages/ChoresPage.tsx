import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ChoreRow } from '../components/ChoreRow'
import { ChevronDown, Plus } from '../components/icons'
import { useChores } from '../hooks/useChores'
import { useLabels } from '../hooks/useLabels'
import { useProjects } from '../hooks/useProjects'
import { CalendarView } from '../components/CalendarView'
import { bucketOrder, bucketTitle, groupChores } from '../lib/scheduler'
import type { Chore, ChoreBucket, Label } from '../types/models'

import type { FilterState } from '../components/FilterMenu'

type ShellContext = {
  openEdit: (chore: Chore) => void
  openCreate: (initialDue?: Date) => void
  activeFilter: FilterState | null
  activeProjectId: string | null
  viewMode: 'agenda' | 'month' | 'week'
  setActiveDate: (date: Date | null) => void
}

export function ChoresPage() {
  const { chores, ready, error, pendingIds, completeTask, moveOverdueToToday, updateTask } =
    useChores()
  const { byId, labels } = useLabels()
  const { projects } = useProjects()
  const { openEdit, openCreate, activeFilter, activeProjectId, viewMode, setActiveDate } = useOutletContext<ShellContext>()
  const [collapsed, setCollapsed] = useState<Partial<Record<ChoreBucket, boolean>>>({})
  const [exiting, setExiting] = useState<Set<string>>(() => new Set())
  const [completing, setCompleting] = useState<Set<string>>(() => new Set())
  
  const filteredChores = useMemo(() => {
    return chores.filter((c) => {
      const matchProject = !activeProjectId || c.projectId === activeProjectId
      const matchPriority = !activeFilter || activeFilter.priorities.length === 0 || activeFilter.priorities.includes(c.priority)
      const matchLabel = !activeFilter || activeFilter.labelIds.length === 0 || activeFilter.labelIds.some(id => c.labelIds.includes(id))
      return matchProject && matchPriority && matchLabel
    })
  }, [chores, activeFilter, activeProjectId])

  const groups = useMemo(() => groupChores(filteredChores), [filteredChores])

  function onComplete(chore: Chore) {
    const isOnce =
      chore.frequency === 'once' || chore.frequency === 'no_repeat'
    setCompleting((prev) => new Set(prev).add(chore.id))
    window.setTimeout(() => {
      if (isOnce) {
        setExiting((prev) => new Set(prev).add(chore.id))
        window.setTimeout(() => {
          completeTask(chore)
          setExiting((prev) => {
            const n = new Set(prev)
            n.delete(chore.id)
            return n
          })
          setCompleting((prev) => {
            const n = new Set(prev)
            n.delete(chore.id)
            return n
          })
        }, 180)
      } else {
        completeTask(chore)
        setCompleting((prev) => {
          const n = new Set(prev)
          n.delete(chore.id)
          return n
        })
      }
    }, 160)
  }

  if (!ready && !error) {
    return <p className="text-sm text-[var(--muted)]">Loading tasks…</p>
  }
  
  if (viewMode === 'month' || viewMode === 'week') {
    return (
      <CalendarView
        mode={viewMode}
        chores={filteredChores}
        onOpenEdit={openEdit}
        onOpenCreate={openCreate}
        onComplete={onComplete}
        onUpdateTask={updateTask}
        onActiveDateChange={setActiveDate}
        pendingIds={pendingIds}
        exiting={exiting}
        completing={completing}
        labelsById={byId}
      />
    )
  }

  const empty = bucketOrder.every((bucket) => groups[bucket].length === 0)
  const hadAny = chores.length > 0

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {empty ? (
        <div className="flex flex-col items-center px-4 py-16 text-center">
          <div className="mb-8 grid h-24 w-24 grid-cols-3 gap-2 rounded-3xl bg-[var(--accent-wash)] p-5">
            <span className="rounded-md bg-[var(--accent)]" />
            <span className="rounded-md bg-[var(--surface)]" />
            <span className="rounded-md bg-[var(--accent)]" />
            <span className="rounded-md bg-[var(--surface)]" />
            <span className="rounded-md bg-[var(--accent)]" />
            <span className="rounded-md bg-[var(--surface)]" />
            <span className="rounded-md bg-[var(--accent)]" />
            <span className="rounded-md bg-[var(--accent)]" />
            <span className="rounded-md bg-[var(--surface)]" />
          </div>
          <p className="font-mono-meta text-xs uppercase tracking-widest text-[var(--accent)]">
            {activeFilter ? 'No matches' : hadAny ? 'Today is clear' : 'Ready when you are'}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--ink)]">
            {activeFilter ? 'No tasks match this filter.' : hadAny ? 'Everything has its moment.' : 'Capture the next thing.'}
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-[var(--muted)]">
            {activeFilter
              ? 'Try adjusting your filter priorities or labels.'
              : hadAny
              ? 'You finished what was open. Let the rest of the day stay open.'
              : 'Type naturally below. Dates, repeats, and labels light up as you go.'}
          </p>
          <button
            type="button"
            onClick={() => openCreate()}
            className="focus-ring mt-9 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-card)] hover:bg-[var(--accent-pressed)]"
          >
            <Plus size={18} />
            Add a task
          </button>
        </div>
      ) : (
        <>
          <div className="mb-2">
            <p className="font-mono-meta text-xs uppercase tracking-widest text-[var(--muted)]">
              {activeFilter ? 'Filtered' : 'Today'}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--ink)]">
              {activeFilter?.name || 'Tasks'}
            </h1>
          </div>
          {bucketOrder.map((bucket: ChoreBucket) => {
            const items = groups[bucket]
            if (items.length === 0) return null
            const isCollapsed = Boolean(collapsed[bucket])
            return (
              <section key={bucket} className="section-block space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) => ({
                        ...prev,
                        [bucket]: !prev[bucket],
                      }))
                    }
                    aria-expanded={!isCollapsed}
                    className="group flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ease-out group-hover:text-[var(--ink)] ${
                          isCollapsed ? '-rotate-90' : 'rotate-0'
                        }`}
                      />
                      <span
                        className={`truncate text-lg font-semibold ${
                          isCollapsed
                            ? 'text-[var(--muted)]'
                            : 'text-[var(--ink)]'
                        }`}
                      >
                        {bucketTitle[bucket]}
                      </span>
                    </span>
                    <span className="font-mono-meta shrink-0 text-[11px] text-[var(--muted)]">
                      {items.length} {items.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </button>
                  {bucket === 'overdue' && (
                    <button
                      type="button"
                      onClick={() => moveOverdueToToday(items)}
                      className="focus-ring shrink-0 rounded-full border border-[var(--hairline)] px-2.5 py-1 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-wash)]"
                    >
                      Move to today
                    </button>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="space-y-2">
                    {items.map((chore) => (
                      <ChoreRow
                        key={chore.id}
                        chore={chore}
                        labels={
                          chore.labelIds
                            .map((id) => labels.find((l) => l.id === id)!)
                            .filter(Boolean) as Label[]
                        }
                        project={chore.projectId ? projects.find((p) => p.id === chore.projectId) || null : null}
                        pending={pendingIds.has(chore.id)}
                        exiting={exiting.has(chore.id)}
                        completing={completing.has(chore.id)}
                        onOpen={() => openEdit(chore)}
                        onComplete={() => onComplete(chore)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
