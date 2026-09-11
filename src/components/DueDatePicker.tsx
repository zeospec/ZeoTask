import { useMemo, useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from './icons'
import { useModalBack } from '../hooks/useModalBack'
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  isTomorrow,
  nextSaturday,
  setHours,
  setMinutes,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

type Props = {
  value: Date | null
  isAllDay?: boolean
  onApply: (date: Date | null, isAllDay?: boolean) => void
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
      ? 'border-[var(--accent)]/40 bg-[var(--accent-wash)] font-medium text-[var(--accent)] ring-1 ring-[var(--accent)]/30'
      : 'border-transparent bg-[var(--quiet)] text-[var(--ink)] hover:bg-[var(--accent-wash)]',
  ].join(' ')
}

export function DueDatePicker({ value, isAllDay, onApply, onClose }: Props) {
  useModalBack(true, onClose, 'due-date-picker')

  const [cursor, setCursor] = useState(() => startOfMonth(value ?? new Date()))
  const [selected, setSelected] = useState<Date | null>(value)
  const [allDay, setAllDay] = useState<boolean>(() => {
    if (isAllDay !== undefined) {
      if (isAllDay) return true
      if (!value || (value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0)) {
        return true
      }
      return false
    }
    if (!value) return true
    return value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0
  })
  const [timeHour, setTimeHour] = useState(() => {
    if (value && (value.getHours() !== 0 || value.getMinutes() !== 0)) {
      return value.getHours()
    }
    return 9
  })
  const [timeMinute, setTimeMinute] = useState(() => {
    if (value && (value.getHours() !== 0 || value.getMinutes() !== 0)) {
      return value.getMinutes()
    }
    return 0
  })
  const [showCustomTime, setShowCustomTime] = useState(() => {
    if (!value || isAllDay || (value.getHours() === 0 && value.getMinutes() === 0)) return false
    return !matchingQuickTimeLabel(value.getHours(), value.getMinutes())
  })
  const timeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const days = useMemo(() => buildCalendar(cursor), [cursor])

  function pickDate(day: Date) {
    const base = startOfDay(day)
    const hasExplicitNonZeroTime =
      !allDay &&
      (timeHour !== 0 || timeMinute !== 0) &&
      (showCustomTime || quickTimes.some((q) => q.hour === timeHour && q.minute === timeMinute))

    if (!hasExplicitNonZeroTime) {
      setAllDay(true)
      setSelected(base)
    } else {
      setSelected(setMinutes(setHours(base, timeHour), timeMinute))
    }
  }

  function applyQuickDate(day: Date) {
    const base = startOfDay(day)
    const hasExplicitNonZeroTime =
      !allDay &&
      (timeHour !== 0 || timeMinute !== 0) &&
      (showCustomTime || quickTimes.some((q) => q.hour === timeHour && q.minute === timeMinute))

    if (!hasExplicitNonZeroTime) {
      setAllDay(true)
      setSelected(base)
    } else {
      setSelected(setMinutes(setHours(base, timeHour), timeMinute))
    }
    setCursor(startOfMonth(day))
  }

  function applyQuickTime(hour: number, minute: number) {
    setTimeHour(hour)
    setTimeMinute(minute)
    setAllDay(false)
    const base = selected ? startOfDay(selected) : startOfDay(new Date())
    setSelected(setMinutes(setHours(base, hour), minute))
  }

  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)
  const dayOfWeek = today.getDay() // 0 = Sun, 6 = Sat
  const weekend =
    dayOfWeek === 6
      ? addDays(today, 1) // Sunday
      : dayOfWeek === 0
      ? today // Today (Sunday)
      : nextSaturday(today)
  const nextWeek = addWeeks(today, 1)
  const nextMonth = addMonths(today, 1)

  const quickTimeLabel = !allDay && selected
    ? matchingQuickTimeLabel(selected.getHours(), selected.getMinutes())
    : null

  const summary = selected
    ? allDay
      ? isToday(selected)
        ? 'Today · All-Day'
        : isTomorrow(selected)
        ? 'Tomorrow · All-Day'
        : `${format(selected, 'EEE, MMM d')} · All-Day`
      : isToday(selected)
      ? `Today · ${format(selected, 'h:mm a')}${quickTimeLabel ? ` (${quickTimeLabel})` : ''}`
      : isTomorrow(selected)
      ? `Tomorrow · ${format(selected, 'h:mm a')}${quickTimeLabel ? ` (${quickTimeLabel})` : ''}`
      : `${format(selected, 'EEE, MMM d · h:mm a')}${quickTimeLabel ? ` (${quickTimeLabel})` : ''}`
    : 'No date selected'

  const modalContent = (
    <div
      className="fixed inset-0 z-[250] flex items-end justify-center bg-black/40 backdrop-blur-sm p-3 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
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
          Time
        </p>
        <div className="mb-1 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setAllDay(true)
              setShowCustomTime(false)
              if (selected) {
                setSelected(startOfDay(selected))
              }
            }}
            className={chipClass(allDay)}
          >
            All-Day
          </button>
          {quickTimes.map((q) => {
            const active =
              !allDay &&
              !showCustomTime &&
              Boolean(
                selected
                  ? selected.getHours() === q.hour && selected.getMinutes() === q.minute
                  : timeHour === q.hour && timeMinute === q.minute,
              )
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  applyQuickTime(q.hour, q.minute)
                  setShowCustomTime(false)
                }}
                className={chipClass(active)}
              >
                {q.label}
              </button>
            )
          })}
          {/* Custom time chip */}
          <button
            type="button"
            onClick={() => {
              setShowCustomTime(true)
              setAllDay(false)
              // Focus the time input on next paint
              setTimeout(() => timeInputRef.current?.showPicker?.(), 50)
            }}
            className={chipClass(!allDay && showCustomTime)}
          >
            Custom…
          </button>
        </div>

        {/* Inline custom time input — visible only when Custom is active */}
        {showCustomTime && (
          <div className="mb-4 flex items-center gap-2 pl-1">
            <input
              ref={timeInputRef}
              type="time"
              value={`${String(timeHour).padStart(2, '0')}:${String(timeMinute).padStart(2, '0')}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number)
                if (!isNaN(h) && !isNaN(m)) {
                  setTimeHour(h)
                  setTimeMinute(m)
                  setAllDay(false)
                  const base = selected ? startOfDay(selected) : startOfDay(new Date())
                  setSelected(setMinutes(setHours(base, h), m))
                }
              }}
              className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--quiet)] px-3 py-1.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
            <span className="text-xs text-[var(--muted)]">
              {timeHour < 12 ? 'AM' : 'PM'} · pick any time
            </span>
          </div>
        )}
        {!showCustomTime && <div className="mb-4" />}

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
              onApply(null, false)
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
              onClick={() => onApply(selected, allDay)}
              className="rounded-[10px] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
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
