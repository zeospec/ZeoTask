import { format, parseISO } from 'date-fns'
import type { Chore, Label } from '../types/models'
import { priorityLabel, recurrenceSummary } from '../lib/scheduler'
import { Check } from './icons'

type Props = {
  chore: Chore
  labels: Label[]
  project?: { id: string; name: string; color: string } | null
  pending?: boolean
  exiting?: boolean
  completing?: boolean
  onComplete: () => void
  onOpen: () => void
}

/** Complete control + tap body to edit. No ⋯ / chevron clutter. */
export function ChoreRow({
  chore,
  labels,
  project,
  pending,
  exiting,
  completing,
  onComplete,
  onOpen,
}: Props) {
  const shown = labels.slice(0, 2)
  const extra = labels.length - shown.length
  const overdue =
    Boolean(chore.dueAt) &&
    new Date(chore.dueAt!) < new Date() &&
    !chore.archivedAt

  return (
    <article
      className={[
        'group relative flex min-h-16 items-center gap-3 overflow-visible rounded-[var(--radius-control)] border border-[var(--hairline)] bg-[var(--surface)] px-3 py-3 transition',
        'hover:border-[var(--accent)]/25 hover:bg-[color-mix(in_srgb,var(--quiet)_40%,var(--surface))]',
        pending ? 'opacity-60' : '',
        exiting ? 'row-exiting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <h3 className="truncate text-[15.5px] font-medium leading-[22px] text-[var(--ink)]">
          {chore.title}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {chore.dueAt && (
            <span
              className={[
                'font-mono-meta text-[11px] leading-[18px]',
                overdue ? 'text-[var(--danger)]' : 'text-[var(--muted)]',
              ].join(' ')}
            >
              {format(parseISO(chore.dueAt), 'EEE · h:mm a')}
            </span>
          )}
          {shown.map((l) => (
            <span
              key={l.id}
              className="font-mono-meta text-[11px] text-[var(--muted)]"
            >
              {l.name}
            </span>
          ))}
          {extra > 0 && (
            <span className="font-mono-meta text-[11px] text-[var(--muted)]">
              +{extra}
            </span>
          )}
          {project && (
            <span className="flex items-center gap-1 font-mono-meta text-[11px] leading-[18px] text-[var(--ink)]">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: project.color }} />
              {project.name}
            </span>
          )}
          {chore.priority > 0 && (
            <span className="font-mono-meta text-[11px] text-[var(--due-soon)]">
              {priorityLabel(chore.priority)}
            </span>
          )}
          {chore.frequency !== 'once' && chore.frequency !== 'no_repeat' && (
            <span className="text-[11px] text-[var(--muted)]">
              {recurrenceSummary(
                chore.frequency,
                chore.repeatEvery,
                chore.repeatWeekdays,
              )}
            </span>
          )}
          {chore.subtasks.length > 0 && (
            <div className="flex items-center gap-1.5 ml-1">
              <svg className="text-[var(--muted)]" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              <div className="h-1 w-12 overflow-hidden rounded-full bg-[var(--hairline)]">
                <div 
                  className="h-full bg-[var(--accent)] transition-all duration-500 ease-out"
                  style={{ width: `${(chore.subtasks.filter(s => s.completed).length / chore.subtasks.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </button>

      <button
        type="button"
        aria-label={`Complete ${chore.title}`}
        onClick={(e) => {
          e.stopPropagation()
          onComplete()
        }}
        className={[
          'focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hairline)] text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]',
          completing ? 'check-done' : '',
        ].join(' ')}
      >
        <Check
          size={16}
          className={
            completing ? 'text-white' : 'opacity-35 group-hover:opacity-100'
          }
        />
      </button>
    </article>
  )
}
