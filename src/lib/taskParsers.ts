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

  // Natural P1–P4 (optional legacy bang): "buy milk p2", "!p1"
  for (const match of input.matchAll(/!?p([1-4])\b/gi)) {
    const full = match[0]
    const prio = Number(match[1]) as Priority
    const start = match.index ?? 0
    out.push({
      kind: 'priority',
      start,
      end: start + full.length,
      text: full,
      priority: 55,
      apply: (acc) => {
        acc.priority = prio
      },
    })
  }

  const sentence = input.toLowerCase()
  const phraseMap: Record<number, string[]> = {
    1: ['priority 1', 'high priority', 'urgent', 'asap', 'important'],
    2: ['priority 2', 'medium priority'],
    3: ['priority 3', 'low priority'],
    4: ['priority 4'],
  }

  for (const [prio, terms] of Object.entries(phraseMap)) {
    for (const term of terms) {
      const index = sentence.indexOf(term)
      if (index === -1) continue
      out.push({
        kind: 'priority',
        start: index,
        end: index + term.length,
        text: input.slice(index, index + term.length),
        priority: 50,
        apply: (acc) => {
          acc.priority = Number(prio) as Priority
        },
      })
    }
  }
  return out
}

function collectLabels(input: string): RawMatch[] {
  const labelPattern = /#([\p{L}\p{N}_]+)/giu
  const out: RawMatch[] = []
  for (const match of input.matchAll(labelPattern)) {
    const full = match[0]
    const name = match[1]
    const start = match.index ?? 0
    out.push({
      kind: 'label',
      start,
      end: start + full.length,
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
  const projectPattern = /@([\p{L}\p{N}_]+)/giu
  const out: RawMatch[] = []
  for (const match of input.matchAll(projectPattern)) {
    const full = match[0]
    const name = match[1]
    const start = match.index ?? 0
    out.push({
      kind: 'project',
      start,
      end: start + full.length,
      text: full,
      priority: 35,
      apply: (acc) => {
        acc.projectName = name
      },
    })
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

function collectDue(input: string): RawMatch[] {
  const parsed = chrono.parse(input, new Date(), { forwardDate: true })
  const dueDateMatch = parsed.find(
    (match) =>
      match.index !== undefined &&
      isValidWordBoundary(input, match.index, match.text.length),
  )
  if (!dueDateMatch || dueDateMatch.index === undefined) return []

  const dueDateStartIndex = dueDateMatch.index
  const dueDateEndIndex = dueDateStartIndex + dueDateMatch.text.length
  const precedingWords = [
    'starting',
    'from',
    'beginning',
    'begin',
    'commence',
    'commencing',
    'due',
    'on',
    'by',
  ]

  let highlightStartIndex = dueDateStartIndex
  const textBeforeDueDate = input.substring(0, dueDateStartIndex).trimEnd()
  for (const word of precedingWords) {
    const wordPattern = new RegExp(`\\b${word}\\s*$`, 'i')
    const match = textBeforeDueDate.match(wordPattern)
    if (match) {
      highlightStartIndex = textBeforeDueDate.length - match[0].length
      break
    }
  }

  let resultDate = dueDateMatch.start.date()
  if (!dueDateMatch.start.isCertain('hour')) {
    resultDate = new Date(resultDate)
    resultDate.setHours(23, 59, 59, 0)
  }

  return [
    {
      kind: 'due',
      start: highlightStartIndex,
      end: dueDateEndIndex,
      text: input.slice(highlightStartIndex, dueDateEndIndex),
      priority: 20,
      apply: (acc) => {
        acc.dueAt = resultDate
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
