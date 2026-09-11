import * as chrono from 'chrono-node'
import type { Frequency, Priority } from '../types/models'

export type HighlightKind = 'due' | 'repeat' | 'priority' | 'label' | 'project'

export type TextHighlight = {
  text: string
  start: number
  end: number
  kind: HighlightKind
}

export type SmartParseResult = {
  cleanedTitle: string
  dueAt: Date | null
  isAllDay: boolean
  frequency: Frequency
  priority: Priority
  labelNames: string[]
  projectName: string | null
  highlights: TextHighlight[]
  repeatLabel: string | null
}

type RawMatch = {
  kind: HighlightKind
  start: number
  end: number
  text: string
  priority: number
  apply: (acc: MutableParse) => void
}

type MutableParse = {
  dueAt: Date | null
  isAllDay: boolean
  frequency: Frequency
  priority: Priority
  labelNames: string[]
  projectName: string | null
  repeatLabel: string | null
}

const VALID_DAYS: Record<string, string> = {
  monday: 'Monday',
  mon: 'Monday',
  tuesday: 'Tuesday',
  tue: 'Tuesday',
  wednesday: 'Wednesday',
  wed: 'Wednesday',
  thursday: 'Thursday',
  thu: 'Thursday',
  friday: 'Friday',
  fri: 'Friday',
  saturday: 'Saturday',
  sat: 'Saturday',
  sunday: 'Sunday',
  sun: 'Sunday',
}

function isValidWordBoundary(text: string, matchIndex: number, matchLength: number) {
  const charBefore = matchIndex > 0 ? text[matchIndex - 1] : ' '
  const charAfter =
    matchIndex + matchLength < text.length ? text[matchIndex + matchLength] : ' '
  return !(/[\p{L}\p{N}_]/u.test(charBefore) || /[\p{L}\p{N}_]/u.test(charAfter))
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end
}

function mapIntervalUnit(unit: string): Frequency {
  const u = unit.toLowerCase()
  if (u.startsWith('day')) return 'daily'
  if (u.startsWith('week')) return 'weekly'
  if (u.startsWith('month')) return 'monthly'
  if (u.startsWith('year')) return 'yearly'
  return 'daily'
}

function collectPriority(input: string): RawMatch[] {
  const out: RawMatch[] = []

  // Natural P1–P4 with strict word boundary: "buy milk p2", "!p1", "p4"
  for (const match of input.matchAll(/(?:^|[\s,;])(!?p([1-4]))(?=[\s,;]|$)/gi)) {
    const full = match[1]
    const prio = Number(match[2]) as Priority
    const exactStart = (match.index ?? 0) + match[0].indexOf(full)
    out.push({
      kind: 'priority',
      start: exactStart,
      end: exactStart + full.length,
      text: full,
      priority: 55,
      apply: (acc) => {
        acc.priority = prio
      },
    })
  }

  const phraseMap: Record<number, string[]> = {
    1: ['priority 1', 'high priority', 'urgent', 'asap', 'important'],
    2: ['priority 2', 'medium priority'],
    3: ['priority 3', 'low priority'],
    4: ['priority 4'],
  }

  for (const [prio, terms] of Object.entries(phraseMap)) {
    for (const term of terms) {
      const regex = new RegExp(`\\b${term}\\b`, 'gi')
      for (const match of input.matchAll(regex)) {
        const start = match.index ?? 0
        out.push({
          kind: 'priority',
          start,
          end: start + match[0].length,
          text: match[0],
          priority: 50,
          apply: (acc) => {
            acc.priority = Number(prio) as Priority
          },
        })
      }
    }
  }
  if (out.length > 0) {
    return [out[out.length - 1]]
  }
  return out
}

function collectLabels(input: string): RawMatch[] {
  const labelPattern = /(?:^|[\s,;])(#([\p{L}\p{N}_-]+))(?=[\s,;]|$)/giu
  const out: RawMatch[] = []
  for (const match of input.matchAll(labelPattern)) {
    const full = match[1]
    const name = match[2]
    const exactStart = (match.index ?? 0) + match[0].indexOf(full)
    out.push({
      kind: 'label',
      start: exactStart,
      end: exactStart + full.length,
      text: full,
      priority: 30,
      apply: (acc) => {
        if (!acc.labelNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
          acc.labelNames.push(name)
        }
      },
    })
  }
  return out
}

function collectProject(input: string): RawMatch[] {
  const projectPattern = /(?:^|[\s,;])(@([\p{L}\p{N}_-]+))(?=[\s,;]|$)/giu
  const out: RawMatch[] = []
  for (const match of input.matchAll(projectPattern)) {
    const full = match[1]
    const name = match[2]
    const exactStart = (match.index ?? 0) + match[0].indexOf(full)
    out.push({
      kind: 'project',
      start: exactStart,
      end: exactStart + full.length,
      text: full,
      priority: 35,
      apply: (acc) => {
        acc.projectName = name
      },
    })
  }
  if (out.length > 0) {
    return [out[out.length - 1]]
  }
  return out
}

function collectRepeat(input: string): RawMatch[] {
  const sentence = input.toLowerCase()
  const patterns: Array<{
    regex: RegExp
    frequency: Frequency
    label: (m: RegExpMatchArray) => string
  }> = [
    {
      regex: /(every day|daily|everyday)/i,
      frequency: 'daily',
      label: () => 'Every day',
    },
    {
      regex: /(every week|weekly)/i,
      frequency: 'weekly',
      label: () => 'Every week',
    },
    {
      regex: /(every month|monthly)/i,
      frequency: 'monthly',
      label: () => 'Every month',
    },
    {
      regex: /(every year|yearly|annually)/i,
      frequency: 'yearly',
      label: () => 'Every year',
    },
    {
      regex: /(bi-?weekly|every other week)/i,
      frequency: 'weekly',
      label: () => 'Every other week',
    },
    {
      regex: /every (\d+) (days?|weeks?|months?|years?)/i,
      frequency: 'daily',
      label: (m) => `Every ${m[1]} ${m[2]}`,
    },
    {
      regex: /every (monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)s?/i,
      frequency: 'weekly',
      label: (m) => `Every ${VALID_DAYS[m[1].toLowerCase()] ?? m[1]}`,
    },
  ]

  const out: RawMatch[] = []
  for (const pattern of patterns) {
    const match = sentence.match(pattern.regex)
    if (!match || match.index == null) continue
    const start = match.index
    const end = start + match[0].length
    if (!isValidWordBoundary(sentence, start, match[0].length)) continue

    let frequency = pattern.frequency
    if (pattern.regex.source.includes('(\\d+)')) {
      frequency = mapIntervalUnit(match[2] ?? 'days')
    }

    out.push({
      kind: 'repeat',
      start,
      end,
      text: input.slice(start, end),
      priority: 60,
      apply: (acc) => {
        acc.frequency = frequency
        acc.repeatLabel = pattern.label(match)
      },
    })
  }
  return out
}

const ORDINAL_TIME_PATTERN =
  /\b(?:(?:on|by|due\s+on|due)\s+)?(?:the\s+)?([1-9]|[12][0-9]|3[01])(?:st|nd|rd|th)\b(?!\s+(?:floor|century|grade|place|rank))(?:\s+(?:at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?|(\d{1,2}):(\d{2})\s*(am|pm)?|(\d{1,2})\s*(am|pm)))?/gi

function collectDue(input: string): RawMatch[] {
  const refDate = new Date()
  const chronoParsed = chrono.parse(input, refDate, { forwardDate: true })

  const ordinalMatches: Array<{
    start: number
    end: number
    text: string
    date: Date
    isAllDay: boolean
  }> = []

  for (const match of input.matchAll(ORDINAL_TIME_PATTERN)) {
    const rawText = match[0].trimEnd()
    const start = match.index ?? 0
    const end = start + rawText.length
    if (!isValidWordBoundary(input, start, rawText.length)) continue

    const day = parseInt(match[1], 10)
    const hStr = match[2] || match[5] || match[8]
    const minStr = match[3] || match[6]
    const mer = match[4] || match[7] || match[9]

    let targetYear = refDate.getFullYear()
    let targetMonth = refDate.getMonth()
    if (day < refDate.getDate()) {
      targetMonth += 1
      if (targetMonth > 11) {
        targetMonth = 0
        targetYear += 1
      }
    }
    const d = new Date(targetYear, targetMonth, day)
    const hasTime = hStr !== undefined
    const isAllDay = !hasTime
    if (hasTime) {
      let h = parseInt(hStr, 10)
      const min = minStr ? parseInt(minStr, 10) : 0
      if (mer) {
        const isPm = mer.toLowerCase() === 'pm'
        if (isPm && h < 12) h += 12
        if (!isPm && h === 12) h = 0
      }
      d.setHours(h, min, 0, 0)
    } else {
      d.setHours(0, 0, 0, 0)
    }
    ordinalMatches.push({ start, end, text: rawText, date: d, isAllDay })
  }

  // Filter chrono matches that are only bare times subsumed by an ordinal date expression
  const filteredChrono = chronoParsed.filter((cm) => {
    if (cm.index === undefined) return false
    const cStart = cm.index
    const cEnd = cStart + cm.text.length
    return !ordinalMatches.some((om) => om.start <= cStart && om.end >= cEnd)
  })

  // Filter ordinal matches that are subsumed by a fuller chrono match (e.g. "Sep 19th")
  const filteredOrdinal = ordinalMatches.filter((om) => {
    return !filteredChrono.some((cm) => {
      if (cm.index === undefined) return false
      return cm.index <= om.start && cm.index + cm.text.length >= om.end
    })
  })

  const candidates: Array<{
    start: number
    end: number
    text: string
    date: Date
    isAllDay: boolean
  }> = []

  for (const cm of filteredChrono) {
    if (cm.index === undefined) continue
    const rawText = cm.text
    const text = rawText.trimEnd()
    const start = cm.index
    const end = start + text.length
    if (!isValidWordBoundary(input, start, text.length)) continue
    const isAllDay = !cm.start.isCertain('hour')
    let resultDate = cm.start.date()
    if (isAllDay) {
      resultDate = new Date(resultDate)
      resultDate.setHours(0, 0, 0, 0)
    }
    candidates.push({ start, end, text, date: resultDate, isAllDay })
  }

  for (const om of filteredOrdinal) {
    candidates.push(om)
  }

  if (candidates.length === 0) return []

  // Last match in the text wins
  candidates.sort((a, b) => a.start - b.start)
  const chosen = candidates[candidates.length - 1]

  return [
    {
      kind: 'due',
      start: chosen.start,
      end: chosen.end,
      text: input.slice(chosen.start, chosen.end),
      priority: 20,
      apply: (acc) => {
        acc.dueAt = chosen.date
        acc.isAllDay = chosen.isAllDay
      },
    },
  ]
}

function pickNonOverlapping(matches: RawMatch[]): RawMatch[] {
  const sorted = [...matches].sort((a, b) => b.priority - a.priority || a.start - b.start)
  const chosen: RawMatch[] = []
  for (const match of sorted) {
    if (chosen.some((c) => overlaps(c, match))) continue
    chosen.push(match)
  }
  return chosen.sort((a, b) => a.start - b.start)
}

function stripRanges(input: string, ranges: Array<{ start: number; end: number }>) {
  const ordered = [...ranges].sort((a, b) => b.start - a.start)
  let out = input
  for (const range of ordered) {
    out = `${out.slice(0, range.start)}${out.slice(range.end)}`
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** Donetick-style as-you-type parse: highlights stay in the typed string; cleaned title for save. */
export function parseSmartTitle(input: string, ignoredTokens: string[] = []): SmartParseResult {
  const empty: SmartParseResult = {
    cleanedTitle: input.trim(),
    dueAt: null,
    isAllDay: false,
    frequency: 'once',
    priority: 0,
    labelNames: [],
    projectName: null,
    highlights: [],
    repeatLabel: null,
  }
  if (!input.trim()) return empty

  const candidates = [
    ...collectRepeat(input),
    ...collectPriority(input),
    ...collectLabels(input),
    ...collectProject(input),
    ...collectDue(input),
  ].filter((c) => !ignoredTokens.some((ig) => ig.toLowerCase() === c.text.toLowerCase()))
  const chosen = pickNonOverlapping(candidates)

  const acc: MutableParse = {
    dueAt: null,
    isAllDay: false,
    frequency: 'once',
    priority: 0,
    labelNames: [],
    projectName: null,
    repeatLabel: null,
  }
  for (const match of chosen) match.apply(acc)

  return {
    cleanedTitle: stripRanges(
      input,
      chosen.map((m) => ({ start: m.start, end: m.end })),
    ) || input.trim(),
    dueAt: acc.dueAt,
    isAllDay: acc.isAllDay,
    frequency: acc.frequency,
    priority: acc.priority,
    labelNames: acc.labelNames,
    projectName: acc.projectName,
    repeatLabel: acc.repeatLabel,
    highlights: chosen.map((m) => ({
      text: m.text,
      start: m.start,
      end: m.end,
      kind: m.kind,
    })),
  }
}

export type SubtaskParseResult = {
  cleanedTitle: string
  dueAt: Date | null
  isAllDay: boolean
  dueText?: string
  highlights: TextHighlight[]
}

/** Parses natural language due dates specifically for checklist items (avoids stripping # or @ from subtask text) */
export function parseSubtaskTitle(input: string): SubtaskParseResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { cleanedTitle: '', dueAt: null, isAllDay: false, highlights: [] }
  }
  const dueMatches = collectDue(trimmed)
  if (dueMatches.length === 0) {
    return { cleanedTitle: trimmed, dueAt: null, isAllDay: false, highlights: [] }
  }
  const match = dueMatches[0]
  const acc: MutableParse = {
    dueAt: null,
    isAllDay: false,
    frequency: 'once',
    priority: 0,
    labelNames: [],
    projectName: null,
    repeatLabel: null,
  }
  match.apply(acc)
  const cleanedTitle = stripRanges(trimmed, [match])
  return {
    cleanedTitle: cleanedTitle || trimmed,
    dueAt: acc.dueAt,
    isAllDay: acc.isAllDay,
    dueText: match.text,
    highlights: [
      {
        text: match.text,
        start: match.start,
        end: match.end,
        kind: 'due',
      },
    ],
  }
}

