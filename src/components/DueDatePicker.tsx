import { useMemo, useState } from 'react'
import { X } from './icons'
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  nextSaturday,
  setHours,
  setMinutes,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

type Props = {
  value: Date | null
  onApply: (date: Date | null) => void
  onClose: () => void
}

const quickTimes: Array<{ label: string; hour: number; minute: number }> = [
  { label: 'Morning', hour: 9, minute: 0 },
  { label: 'Noon', hour: 12, minute: 0 },
  { label: 'Afternoon', hour: 15, minute: 0 },
  { label: 'Evening', hour: 18, minute: 0 },
  { label: 'Night', hour: 21, minute: 0 },
]

function matchingQuickTimeLabel(hour: number, minute: number): string | null {
  return (
    quickTimes.find((q) => q.hour === hour && q.minute === minute)?.label ?? null
  )
}

function chipClass(active: boolean) {
  return [
    'rounded-full border px-3 py-1.5 text-sm transition',
    active
      ? 'border-[var(--accent)]/40 bg-[var(--accent-wash)] font-medium text-[var(--ink)]'
      : 'border-transparent bg-[var(--quiet)] text-[var(--ink)] hover:bg-[var(--accent-wash)]',
  ].join(' ')
}

export function DueDatePicker({ value, onApply, onClose }: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(value ?? new Date()))
  const [selected, setSelected] = useState<Date | null>(value)
  const [timeHour, setTimeHour] = useState(() => (value ? value.getHours() : 23))
  const [timeMinute, setTimeMinute] = useState(() =>
    value ? value.getMinutes() : 59,
  )

  const days = useMemo(() => buildCalendar(cursor), [cursor])

  function pickDate(day: Date) {
    const withTime = setMinutes(setHours(startOfDay(day), timeHour), timeMinute)
    setSelected(withTime)
  }

  function applyQuickDate(day: Date) {
    const withTime = setMinutes(setHours(startOfDay(day), timeHour), timeMinute)
    setSelected(withTime)
    setCursor(startOfMonth(day))
  }

  function applyQuickTime(hour: number, minute: number) {
    setTimeHour(hour)
    setTimeMinute(minute)
    if (selected) {
      setSelected(setMinutes(setHours(selected, hour), minute))
    } else {
      setSelected(setMinutes(setHours(startOfDay(new Date()), hour), minute))
    }
  }

  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)
  const weekend = nextSaturday(today)
  const nextWeek = addWeeks(today, 1)
  const nextMonth = addMonths(today, 1)

  const quickTimeLabel = selected
    ? matchingQuickTimeLabel(selected.getHours(), selected.getMinutes())
    : matchingQuickTimeLabel(timeHour, timeMinute)

  const summary = selected
    ? `${format(selected, 'EEE, MMM d · h:mm a')}${
        quickTimeLabel ? ` (${quickTimeLabel})` : ''
      }`
    : 'No date selected'

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--ink)]/35 p-3 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="modal-panel relative z-10 w-full max-w-md rounded-[var(--radius-modal)] bg-[var(--surface)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--ink)]">Due Date</h3>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--muted)] hover:bg-[var(--quiet)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p
          className={[
            'mb-4 rounded-[10px] px-3 py-2 font-mono-meta text-[12px]',
            selected
              ? 'bg-[var(--accent-wash)] text-[var(--accent)]'
              : 'bg-[var(--quiet)] text-[var(--muted)]',
          ].join(' ')}
          aria-live="polite"
        >
          {summary}
        </p>

        <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
          Quick date
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { label: 'Today', date: today },
            { label: 'Tomorrow', date: tomorrow },
            { label: 'Weekend', date: weekend },
            { label: 'Next week', date: nextWeek },
            { label: 'Next month', date: nextMonth },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => applyQuickDate(q.date)}
              className={chipClass(Boolean(selected && isSameDay(selected, q.date)))}
            >
              {q.label}
            </button>
          ))}
        </div>

        <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
          Quick time
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {quickTimes.map((q) => {
            const active =
              (selected
                ? selected.getHours() === q.hour && selected.getMinutes() === q.minute
                : timeHour === q.hour && timeMinute === q.minute)
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => applyQuickTime(q.hour, q.minute)}
                className={chipClass(active)}
              >
                {q.label}
              </button>
            )
          })}
        </div>

        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[var(--muted)] hover:bg-[var(--quiet)]"
            onClick={() => setCursor(addMonths(cursor, -1))}
          >
            ‹
          </button>
          <p className="text-sm font-medium text-[var(--ink)]">
            {format(cursor, 'MMMM yyyy')}
          </p>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[var(--muted)] hover:bg-[var(--quiet)]"
            onClick={() => setCursor(addMonths(cursor, 1))}
          >
            ›
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[var(--muted)]">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(({ date, inMonth }) => {
            const isSelected =
              selected &&
              format(selected, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
            return (
              <button
                key={date.toISOString()}
                type="button"
                disabled={!inMonth}
                onClick={() => pickDate(date)}
                className={[
                  'aspect-square rounded-full text-sm',
                  !inMonth && 'invisible',
                  isSelected
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--ink)] hover:bg-[var(--quiet)]',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {format(date, 'd')}
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-[10px] px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--quiet)]"
            onClick={() => {
              setSelected(null)
              onApply(null)
            }}
          >
            Clear
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[10px] bg-[var(--quiet)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onApply(selected)}
              className="rounded-[10px] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function buildCalendar(month: Date) {
  const start = startOfWeek(startOfMonth(month))
  const end = endOfWeek(endOfMonth(month))
  const days: Array<{ date: Date; inMonth: boolean }> = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days.push({ date: d, inMonth: d.getMonth() === month.getMonth() })
  }
  return days
}
