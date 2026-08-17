import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfDay,
  endOfMonth,
  format,
  getDay,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfTomorrow,
} from 'date-fns'
import type { Chore, ChoreBucket, Frequency } from '../types/models'

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Repeatable = Pick<
  Chore,
  'dueAt' | 'isRolling' | 'frequency' | 'repeatEvery' | 'repeatWeekdays'
>

export function nextDueAfterComplete(
  chore: Repeatable,
  completedAt: Date = new Date(),
): string | null {
  if (chore.frequency === 'once' || chore.frequency === 'no_repeat') {
    return null
  }

  const every = Math.max(1, chore.repeatEvery || 1)
  const base = chore.isRolling
    ? completedAt
    : chore.dueAt
      ? parseISO(chore.dueAt)
      : completedAt

  if (chore.frequency === 'weekly' && chore.repeatWeekdays.length > 0) {
    return nextWeeklyOccurrence(base, chore.repeatWeekdays, every).toISOString()
  }

  return advance(base, chore.frequency, every).toISOString()
}

/** Preview next due from a given anchor (for create/edit UI). */
export function previewNextDue(
  chore: Repeatable,
  from: Date = new Date(),
): Date | null {
  if (chore.frequency === 'once' || chore.frequency === 'no_repeat') return null
  const every = Math.max(1, chore.repeatEvery || 1)
  if (chore.frequency === 'weekly' && chore.repeatWeekdays.length > 0) {
    return nextWeeklyOccurrence(from, chore.repeatWeekdays, every)
  }
  return advance(from, chore.frequency, every)
}

function nextWeeklyOccurrence(
  from: Date,
  weekdays: number[],
  every: number,
): Date {
  const sorted = [...new Set(weekdays)].filter((d) => d >= 0 && d <= 6).sort()
  if (sorted.length === 0) return addWeeks(from, every)

  const start = addDays(from, 1)
  for (let i = 0; i < 14 * every + 7; i++) {
    const candidate = addDays(start, i)
    if (!sorted.includes(getDay(candidate))) continue
    if (every <= 1) return candidate
    const weeksFromBase = Math.floor(
      (startOfDay(candidate).getTime() - startOfDay(from).getTime()) /
        (7 * 24 * 60 * 60 * 1000),
    )
    if (weeksFromBase % every === 0 || weeksFromBase === 0) {
      // First hit after from within the every-N week cycle
      const weekIndex = Math.floor(
        (candidate.getTime() - from.getTime()) / (7 * 24 * 60 * 60 * 1000),
      )
      if (weekIndex % every === 0) return candidate
    }
  }
  return addWeeks(from, every)
}

function advance(from: Date, frequency: Frequency, every: number): Date {
  switch (frequency) {
    case 'daily':
      return addDays(from, every)
    case 'weekly':
      return addWeeks(from, every)
    case 'monthly':
      return addMonths(from, every)
    case 'yearly':
      return addYears(from, every)
    case 'once':
    case 'no_repeat':
      return from
    default: {
      const _exhaustive: never = frequency
      return _exhaustive
    }
  }
}

export function recurrenceSummary(
  frequency: Frequency,
  repeatEvery = 1,
  repeatWeekdays: number[] = [],
): string {
  if (frequency === 'once' || frequency === 'no_repeat') return 'No repeat'
  const n = Math.max(1, repeatEvery)
  const days =
    frequency === 'weekly' && repeatWeekdays.length > 0
      ? ` on ${[...repeatWeekdays]
          .sort()
          .map((d) => WEEKDAY_SHORT[d])
          .join(', ')}`
      : ''
  switch (frequency) {
    case 'daily':
      return n === 1 ? 'Every day' : `Every ${n} days`
    case 'weekly':
      return (n === 1 ? 'Every week' : `Every ${n} weeks`) + days
    case 'monthly':
      return n === 1 ? 'Every month' : `Every ${n} months`
    case 'yearly':
      return n === 1 ? 'Every year' : `Every ${n} years`
    default: {
      const _exhaustive: never = frequency
      return _exhaustive
    }
  }
}

export function formatPreviewDue(date: Date | null): string | null {
  if (!date) return null
  return `Next: ${format(date, 'EEE, MMM d · h:mm a')}`
}

export function bucketForChore(chore: Chore, now = new Date()): ChoreBucket {
  if (!chore.dueAt) return 'anytime'
  const due = parseISO(chore.dueAt)
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const tomorrow = startOfTomorrow()
  const tomorrowEnd = endOfDay(tomorrow)
  const next7End = endOfDay(addDays(now, 7))
  const monthEnd = endOfMonth(now)

  if (isBefore(due, todayStart)) return 'overdue'
  if (!isAfter(due, todayEnd)) return 'today'
  if (!isAfter(due, tomorrowEnd) || isSameDay(due, tomorrow)) return 'tomorrow'
  if (!isAfter(due, next7End)) return 'next7'
  if (!isAfter(due, monthEnd)) return 'laterMonth'
  return 'future'
}

export const bucketOrder: ChoreBucket[] = [
  'overdue',
  'today',
  'tomorrow',
  'next7',
  'laterMonth',
  'future',
  'anytime',
]

export const bucketTitle: Record<ChoreBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  next7: 'Next 7 Days',
  laterMonth: 'Later This Month',
  future: 'Future',
  anytime: 'Anytime',
}

export function groupChores(chores: Chore[]) {
  const groups: Record<ChoreBucket, Chore[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    next7: [],
    laterMonth: [],
    future: [],
    anytime: [],
  }
  for (const chore of chores) {
    if (chore.archivedAt) continue
    groups[bucketForChore(chore)].push(chore)
  }
  const byDue = (a: Chore, b: Chore) => {
    if (!a.dueAt) return 1
    if (!b.dueAt) return -1
    return a.dueAt.localeCompare(b.dueAt)
  }
  for (const key of bucketOrder) {
    if (key === 'anytime') {
      groups[key].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    } else {
      groups[key].sort(byDue)
    }
  }
  return groups
}

export function priorityLabel(priority: number): string {
  if (priority <= 0) return 'None'
  return `P${priority}`
}

/** Keep local clock time; move calendar day to today. */
export function moveDueToToday(dueAtIso: string, now = new Date()): string {
  const due = parseISO(dueAtIso)
  const next = new Date(now)
  next.setHours(
    due.getHours(),
    due.getMinutes(),
    due.getSeconds(),
    due.getMilliseconds(),
  )
  return next.toISOString()
}
