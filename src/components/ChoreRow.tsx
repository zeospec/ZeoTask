import { format, parseISO } from 'date-fns'
import type { Chore, Label } from '../types/models'
import { priorityLabel, recurrenceSummary } from '../lib/scheduler'
import { Check } from './icons'

type Props = {
  chore: Chore
  labels: Label[]
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
            <span className="font-mono-meta text-[11px] text-[var(--muted)]">
              {chore.subtasks.filter((s) => s.completed).length}/
              {chore.subtasks.length}
            </span>
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
