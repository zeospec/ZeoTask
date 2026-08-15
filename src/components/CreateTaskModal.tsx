import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { format, isTomorrow, isToday } from 'date-fns'
import { DueDatePicker } from './DueDatePicker'
import { Check, Plus, X, Tag } from './icons'
import { RichDescriptionEditor } from './RichDescriptionEditor'
import { SmartTaskTitleInput } from './SmartTaskTitleInput'
import { useAuth } from '../hooks/useAuth'
import { useChores } from '../hooks/useChores'
import { useLabels } from '../hooks/useLabels'
import { useProjects } from '../hooks/useProjects'
import { ensureLabelIds } from '../lib/labels'
import {
  formatPreviewDue,
  previewNextDue,
  recurrenceSummary,
} from '../lib/scheduler'
import {
  parseSmartTitle,
  type SmartParseResult,
} from '../lib/taskParsers'
import type { Chore, Frequency, Priority, Subtask } from '../types/models'

type Props = {
  open: boolean
  editing: Chore | null
  initialDue?: Date
  initialTitle?: string
  initialOverrides?: { projectId: string | null; manualLabels: string[]; ignoredTokens: { text: string; kind: string }[] }
  activeProjectId?: string | null
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}

const freqOptions: Array<{ value: Frequency; label: string }> = [
  { value: 'once', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

const priorityOptions: Array<{ value: Priority; label: string }> = [
  { value: 0, label: 'No priority' },
  { value: 1, label: 'P1 Urgent' },
  { value: 2, label: 'P2 High' },
  { value: 3, label: 'P3 Medium' },
  { value: 4, label: 'P4 Low' },
]

const WEEKDAYS = [
  { d: 0, label: 'S' },
  { d: 1, label: 'M' },
  { d: 2, label: 'T' },
  { d: 3, label: 'W' },
  { d: 4, label: 'T' },
  { d: 5, label: 'F' },
  { d: 6, label: 'S' },
]

export function CreateTaskModal({ open, editing, initialDue, initialTitle, initialOverrides, activeProjectId, onClose, onSaved, onDeleted }: Props) {
  const { user } = useAuth()
  const { createTask, updateTask, deleteTask } = useChores()
  const { labels, create: createLabel } = useLabels()
  const { projects, create: createProject } = useProjects()
  const panelRef = useRef<HTMLDivElement>(null)
  const subInputRef = useRef<HTMLInputElement>(null)
  const [rawTitle, setRawTitle] = useState(initialTitle || '')
  const [parsed, setParsed] = useState<SmartParseResult>(() => parseSmartTitle(initialTitle || ''))
  const [ignoredTokens, setIgnoredTokens] = useState<{text: string; kind: string}[]>(initialOverrides?.ignoredTokens || [])
  const [dueOverride, setDueOverride] = useState<Date | null | undefined>(undefined)
  const [freqOverride, setFreqOverride] = useState<Frequency | undefined>(undefined)
  const [prioOverride, setPrioOverride] = useState<Priority | undefined>(undefined)
  const [repeatEvery, setRepeatEvery] = useState(1)
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([])
  const [projectOverride, setProjectOverride] = useState<string | null | undefined>(initialOverrides?.projectId || undefined)
  /** Labels added via the Labels menu (not from live title NLP). */
  const [manualLabelNames, setManualLabelNames] = useState<string[]>(initialOverrides?.manualLabels || [])
  /** NLP labels the user explicitly turned off in the Labels menu. */
  const [excludedLabelNames, setExcludedLabelNames] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [subDraft, setSubDraft] = useState('')
  const [dueOpen, setDueOpen] = useState(false)
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [atMenuOpen, setAtMenuOpen] = useState(false)
  const [atQuery, setAtQuery] = useState('')
  const [hashMenuOpen, setHashMenuOpen] = useState(false)
  const [hashQuery, setHashQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [focusNotes, setFocusNotes] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [session, setSession] = useState(0)
  const isEdit = Boolean(editing)

  const reset = useCallback(() => {
    setRawTitle(initialTitle || '')
    setIgnoredTokens(initialOverrides?.ignoredTokens || [])
    setParsed(parseSmartTitle(initialTitle || '', initialOverrides?.ignoredTokens || []))
    setDueOverride(undefined)
    setFreqOverride(undefined)
    setPrioOverride(undefined)
    setProjectOverride(initialOverrides?.projectId || undefined)
    setRepeatEvery(1)
    setRepeatWeekdays([])
    setManualLabelNames(initialOverrides?.manualLabels || [])
    setExcludedLabelNames([])
    setDescription('')
    setSubtasks([])
    setSubDraft('')
    setDueOpen(false)
    setRepeatOpen(false)
    setPriorityOpen(false)
    setLabelsOpen(false)
    setError(null)
    setFocusNotes(false)
    setConfirmDelete(false)
  }, [initialTitle, initialOverrides])

  useEffect(() => {
    if (!open) return
    setSession((s) => s + 1)
    setFocusNotes(false)
    if (editing) {
      setRawTitle(editing.title)
      setIgnoredTokens([])
      setParsed(() => parseSmartTitle(editing.title, []))
      setDueOverride(undefined)
      setFreqOverride(undefined)
      setPrioOverride(undefined)
      setProjectOverride(undefined)
      setRepeatEvery(editing.repeatEvery || 1)
      setRepeatWeekdays(editing.repeatWeekdays || [])
      setDescription(editing.description)
      setSubtasks(editing.subtasks)
      setManualLabelNames(
        editing.labelIds
          .map((id) => labels.find((l) => l.id === id)?.name)
          .filter(Boolean) as string[],
      )
      setExcludedLabelNames([])
      setError(null)
    } else {
      reset()
      if (initialDue) {
        setDueOverride(initialDue)
      }
    }
  }, [open, editing, initialDue, reset, labels])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void submit()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setFocusNotes(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        subInputRef.current?.focus()
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    onClose,
    rawTitle,
    dueOverride,
    freqOverride,
    prioOverride,
    manualLabelNames,
    description,
    subtasks,
    repeatEvery,
    repeatWeekdays,
  ])

  const onParsed = useCallback((next: SmartParseResult) => {
    setParsed(next)
  }, [])

  const labelNames = (() => {
    const out: string[] = []
    const excluded = new Set(excludedLabelNames.map((n) => n.toLowerCase()))
    for (const name of [
      ...manualLabelNames,
      ...parsed.labelNames.filter(
        (n) => !excluded.has(n.toLowerCase()) && labels.some((l) => l.name.toLowerCase() === n.toLowerCase())
      ),
    ]) {
      if (!out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name)
    }
    return out
  })()

  const labelsPillText =
    labelNames.length === 0
      ? 'Labels'
      : labelNames.length === 1
        ? `#${labelNames[0]}`
        : `${labelNames.length} labels`

  const hasNlpDue = parsed.highlights.some((h) => h.kind === 'due')
  const dueAt =
    dueOverride !== undefined
      ? dueOverride
      : hasNlpDue
        ? parsed.dueAt
        : editing
          ? (editing.dueAt ? new Date(editing.dueAt) : null)
          : parsed.dueAt

  const hasNlpPriority = parsed.highlights.some((h) => h.kind === 'priority')
  const priority =
    prioOverride !== undefined
      ? prioOverride
      : hasNlpPriority
        ? parsed.priority
        : editing
          ? editing.priority
          : parsed.priority

  const hasNlpFreq = parsed.highlights.some((h) => h.kind === 'repeat')
  const frequency =
    freqOverride !== undefined
      ? freqOverride
      : hasNlpFreq
        ? parsed.frequency
        : editing
          ? (editing.frequency === 'no_repeat' ? 'once' : editing.frequency)
          : parsed.frequency

  const nextPreview = previewNextDue(
    {
      dueAt: dueAt?.toISOString() ?? null,
      isRolling: true,
      frequency,
      repeatEvery,
      repeatWeekdays,
    },
    dueAt ?? new Date(),
  )

  const hasNlpProject = parsed.highlights.some((h) => h.kind === 'project')
  const nlpMatchedProject = hasNlpProject && parsed.projectName
    ? projects.find((p) => p.name.toLowerCase() === parsed.projectName?.toLowerCase())
    : null

  const finalProjectId =
    projectOverride !== undefined
      ? projectOverride
      : nlpMatchedProject
        ? nlpMatchedProject.id
        : editing
          ? editing.projectId
          : activeProjectId || null

  const activeProjectName = finalProjectId
    ? projects.find((p) => p.id === finalProjectId)?.name
    : null

  function addSubtask() {
    const t = subDraft.trim()
    if (!t) return
    setSubtasks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: t, completed: false },
    ])
    setSubDraft('')
    requestAnimationFrame(() => subInputRef.current?.focus())
  }

  async function submit() {
    if (!user) return
    const latest = parseSmartTitle(rawTitle, ignoredTokens.map((t) => t.text))
    const title = latest.cleanedTitle.trim()
    if (!title) {
      setError('Type a task name')
      return
    }
    setError(null)
    const freq = freqOverride ?? latest.frequency
    let labelIds: string[] = []
    try {
      labelIds = await ensureLabelIds(user.uid, labelNames, [...labels])
    } catch {
      setError('Could not save labels')
      return
    }

    const payload = {
      title,
      description,
      frequency: freq,
      isRolling: true as const,
      priority,
      dueAt: dueAt?.toISOString() ?? null,
      labelIds,
      projectId: finalProjectId,
      subtasks,
      repeatEvery: freq === 'once' || freq === 'no_repeat' ? 1 : Math.max(1, repeatEvery),
      repeatWeekdays: freq === 'weekly' ? repeatWeekdays : [],
    }

    if (editing) {
      updateTask(editing.id, { ...payload, archivedAt: null })
    } else {
      createTask(payload)
    }
    reset()
    onSaved()
  }

  if (!open) return null

  const doneCount = subtasks.filter((s) => s.completed).length
  const primaryLabel = (() => {
    if (isEdit) return 'Save'
    if (dueAt && isTomorrow(dueAt)) return 'Add to tomorrow'
    if (dueAt && isToday(dueAt)) return 'Add to today'
    if (dueAt) return `Add · ${format(dueAt, 'MMM d')}`
    return 'Add task'
  })()

  function handleDelete() {
    if (!editing) return
    deleteTask(editing.id, editing.title)
    reset()
    onDeleted?.()
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--ink)]/35 p-3 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        className="modal-panel relative z-10 flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-modal)] border border-[var(--hairline)] bg-[var(--surface)]"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
          <div className="min-w-0">
            <p className="font-mono-meta text-[11px] uppercase tracking-widest text-[var(--muted)]">
              {isEdit ? 'Edit' : 'Quick add'}
            </p>
            <h2
              id="create-task-title"
              className="mt-1 text-xl font-semibold tracking-tight text-[var(--ink)]"
            >
              {isEdit ? 'Update task' : 'New Task'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--quiet)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-5 px-5 pt-3 pb-2">
            <div>
              <div className="relative -mx-3.5">
                <div className="rounded-xl border border-transparent px-3.5 py-2.5 transition-all hover:bg-[var(--quiet)]/50 focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-sm">
                  <SmartTaskTitleInput
                    key={`title-${session}`}
                    value={rawTitle}
                    onChange={(val) => {
                      setRawTitle(val)
                      // Prune ignored tokens whose text no longer exists in the input.
                      // This allows re-detection when user backspaces and retypes.
                      setIgnoredTokens((prev) => {
                        const kept = prev.filter((tok) =>
                          val.toLowerCase().includes(tok.text.toLowerCase()),
                        )
                        if (kept.length < prev.length) {
                          const removed = prev.filter(
                            (tok) => !val.toLowerCase().includes(tok.text.toLowerCase()),
                          )
                          for (const tok of removed) {
                            if (tok.kind === 'due') setDueOverride(undefined)
                            if (tok.kind === 'repeat') setFreqOverride(undefined)
                            if (tok.kind === 'priority') setPrioOverride(undefined)
                          }
                        }
                        return kept
                      })
                    }}
                    onParsed={onParsed}
                    onSubmit={() => void submit()}
                    autoFocus={!isEdit && !focusNotes}
                    ignoredTokens={ignoredTokens.map((t) => t.text)}
                    onAtTrigger={(active, query) => {
                      setAtMenuOpen(active)
                      setAtQuery(query)
                      if (active) setHashMenuOpen(false)
                    }}
                    onHashTrigger={(active, query) => {
                      setHashMenuOpen(active)
                      setHashQuery(query)
                      if (active) setAtMenuOpen(false)
                    }}
                    highlights={parsed.highlights}
                  />
                </div>
                {/* Inline @ project autocomplete — appears directly below the input */}
                {atMenuOpen && (() => {
                  const filtered = projects.filter(
                    (p) =>
                      p.name.toLowerCase().includes(atQuery.toLowerCase()) &&
                      p.id !== projectOverride,
                  )
                  const showCreate =
                    atQuery.trim() &&
                    !projects.some(
                      (p) => p.name.toLowerCase() === atQuery.trim().toLowerCase(),
                    )
                  const showEmpty = projects.length === 0 && !atQuery.trim()
                  if (!filtered.length && !showCreate && !showEmpty) return null

                  return (
                    <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] shadow-lg overflow-hidden">
                      <div className="max-h-44 overflow-y-auto py-1">
                        {filtered.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              // Remove the @query from the title
                              const atIdx = rawTitle.lastIndexOf('@')
                              if (atIdx !== -1) {
                                setRawTitle(rawTitle.slice(0, atIdx).trimEnd() + ' ')
                              }
                              setProjectOverride(p.id)
                              setAtMenuOpen(false)
                              setAtQuery('')
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--quiet)] transition-colors"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: p.color }}
                            />
                            <span className="truncate">{p.name}</span>
                          </button>
                        ))}
                      {atQuery.trim() &&
                        !projects.some(
                          (p) => p.name.toLowerCase() === atQuery.trim().toLowerCase(),
                        ) && (
                          <button
                            type="button"
                            onClick={async () => {
                              const atIdx = rawTitle.lastIndexOf('@')
                              if (atIdx !== -1) {
                                setRawTitle(rawTitle.slice(0, atIdx).trimEnd() + ' ')
                              }
                              const newId = await createProject(atQuery.trim())
                              setProjectOverride(newId)
                              setAtMenuOpen(false)
                              setAtQuery('')
                            }}
                            className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-wash)] border-t border-[var(--hairline)] transition-colors"
                          >
                            <Plus size={14} />
                            Create "{atQuery.trim()}"
                          </button>
                        )}
                      {projects.length === 0 && !atQuery.trim() && (
                        <p className="px-3.5 py-2 text-xs text-[var(--muted)]">No projects yet. Type a name to create one.</p>
                      )}
                    </div>
                  </div>
                  )
                })()}
                {/* Inline # label autocomplete — appears directly below the input */}
                {hashMenuOpen && (() => {
                  const filtered = labels.filter((l) =>
                    l.name.toLowerCase().includes(hashQuery.toLowerCase()),
                  )
                  const showCreate =
                    hashQuery.trim() &&
                    !labels.some(
                      (l) => l.name.toLowerCase() === hashQuery.trim().toLowerCase(),
                    )
                  const showEmpty = labels.length === 0 && !hashQuery.trim()
                  if (!filtered.length && !showCreate && !showEmpty) return null

                  return (
                    <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] shadow-lg overflow-hidden">
                      <div className="max-h-44 overflow-y-auto py-1">
                        {filtered.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              const hashIdx = rawTitle.lastIndexOf('#')
                              if (hashIdx !== -1) {
                                setRawTitle(rawTitle.slice(0, hashIdx).trimEnd() + ' ')
                              }
                              if (!manualLabelNames.includes(l.name)) {
                                setManualLabelNames((p) => [...p, l.name])
                              }
                              setHashMenuOpen(false)
                              setHashQuery('')
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--quiet)] transition-colors"
                          >
                            <span className="text-[var(--muted)] shrink-0">#</span>
                            <span className="truncate flex items-center gap-2"><Tag size={14} className="text-[var(--muted)]" /> {l.name}</span>
                          </button>
                        ))}
                      {hashQuery.trim() &&
                        !labels.some(
                          (l) => l.name.toLowerCase() === hashQuery.trim().toLowerCase(),
                        ) && (
                          <button
                            type="button"
                            onClick={() => {
                              const hashIdx = rawTitle.lastIndexOf('#')
                              if (hashIdx !== -1) {
                                setRawTitle(rawTitle.slice(0, hashIdx).trimEnd() + ' ')
                              }
                              const trimmed = hashQuery.trim()
                              createLabel(trimmed).then(() => {
                                if (!manualLabelNames.includes(trimmed)) {
                                  setManualLabelNames((p) => [...p, trimmed])
                                }
                              })
                              setHashMenuOpen(false)
                              setHashQuery('')
                            }}
                            className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-wash)] border-t border-[var(--hairline)] transition-colors"
                          >
                            <Plus size={14} />
                            Create "#{hashQuery.trim()}"
                          </button>
                        )}
                      {labels.length === 0 && !hashQuery.trim() && (
                        <p className="px-3.5 py-2 text-xs text-[var(--muted)]">No labels yet. Type a name to create one.</p>
                      )}
                    </div>
                  </div>
                  )
                })()}
              </div>
              {(dueAt ||
                labelNames.length > 0 ||
                priority > 0 ||
                activeProjectName ||
                frequency !== 'once') && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {dueAt && (
                    <span className="group flex items-center gap-1 rounded-full bg-[var(--accent-wash)] pl-2.5 pr-1.5 py-1 font-mono-meta text-[11px] text-[var(--accent)]">
                      {format(dueAt, 'EEE, MMM d · h:mm a')}
                      <button
                        type="button"
                        aria-label="Remove due date"
                        className="rounded-full p-0.5 opacity-50 hover:bg-[var(--accent)] hover:text-white hover:opacity-100"
                        onClick={() => {
                          const h = parsed.highlights.find((x) => x.kind === 'due')
                          if (h) setIgnoredTokens((p) => [...p, { text: h.text, kind: 'due' }])
                          setDueOverride(null)
                        }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  {frequency !== 'once' && (
                    <span className="group flex items-center gap-1 rounded-full bg-[var(--quiet)] pl-2.5 pr-1.5 py-1 text-[11px] text-[var(--ink)]">
                      {recurrenceSummary(frequency, repeatEvery, repeatWeekdays)}
                      <button
                        type="button"
                        aria-label="Remove repeat"
                        className="rounded-full p-0.5 opacity-40 hover:bg-[var(--ink)] hover:text-white hover:opacity-100"
                        onClick={() => {
                          const h = parsed.highlights.find((x) => x.kind === 'repeat')
                          if (h) setIgnoredTokens((p) => [...p, { text: h.text, kind: 'repeat' }])
                          setFreqOverride('once')
                        }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  {priority > 0 && (
                    <span className="group flex items-center gap-1 rounded-full bg-[var(--quiet)] pl-2.5 pr-1.5 py-1 font-mono-meta text-[11px] text-[var(--due-soon)]">
                      P{priority}
                      <button
                        type="button"
                        aria-label="Remove priority"
                        className="rounded-full p-0.5 opacity-40 hover:bg-[var(--due-soon)] hover:text-white hover:opacity-100"
                        onClick={() => {
                          const h = parsed.highlights.find((x) => x.kind === 'priority')
                          if (h) setIgnoredTokens((p) => [...p, { text: h.text, kind: 'priority' }])
                          setPrioOverride(0)
                        }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  {activeProjectName && (
                    <span className="group flex items-center gap-1 rounded-full bg-[var(--quiet)] pl-2.5 pr-1.5 py-1 font-mono-meta text-[11px] text-[var(--ink)]">
                      @{activeProjectName}
                      <button
                        type="button"
                        aria-label="Remove project"
                        className="rounded-full p-0.5 opacity-40 hover:bg-[var(--ink)] hover:text-white hover:opacity-100"
                        onClick={() => {
                          const h = parsed.highlights.find((x) => x.kind === 'project')
                          if (h) setIgnoredTokens((p) => [...p, { text: h.text, kind: 'project' }])
                          setProjectOverride(null)
                        }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  {labelNames.map((n) => (
                    <span
                      key={n}
                      className="group flex items-center gap-1 rounded-full bg-[var(--quiet)] pl-2.5 pr-1.5 py-1 font-mono-meta text-[11px] text-[var(--ink)]"
                    >
                      <Tag size={12} className="text-[var(--muted)]" />
                      {n}
                      <button
                        type="button"
                        aria-label={`Remove label ${n}`}
                        className="rounded-full p-0.5 opacity-40 hover:bg-[var(--ink)] hover:text-white hover:opacity-100"
                        onClick={() => {
                          const isManual = manualLabelNames.includes(n)
                          if (isManual) {
                            setManualLabelNames((p) => p.filter((x) => x !== n))
                          } else {
                            const h = parsed.highlights.find(
                              (x) => x.kind === 'label' && x.text.toLowerCase() === `#${n}`.toLowerCase()
                            )
                            if (h) {
                              setIgnoredTokens((p) => [...p, { text: h.text, kind: 'label' }])
                            } else {
                              setExcludedLabelNames((p) => [...p, n])
                            }
                          }
                        }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 overflow-visible">
              <div className="relative">
                <Pill
                  active={Boolean(dueAt)}
                  onClick={() => {
                    setDueOpen(true)
                    setRepeatOpen(false)
                    setPriorityOpen(false)
                    setLabelsOpen(false)
                    setProjectsOpen(false)
                  }}
                >
                  {dueAt ? format(dueAt, 'MMM d · h:mm a') : 'Due'}
                </Pill>
              </div>
              <div className="relative">
                <Pill
                  active={frequency !== 'once'}
                  onClick={() => {
                    setRepeatOpen((v) => !v)
                    setDueOpen(false)
                    setPriorityOpen(false)
                    setLabelsOpen(false)
                    setProjectsOpen(false)
                  }}
                >
                  {frequency === 'once'
                    ? 'Repeat'
                    : recurrenceSummary(frequency, repeatEvery, repeatWeekdays)}
                </Pill>
                {repeatOpen && (
                  <Menu onClose={() => setRepeatOpen(false)}>
                    {freqOptions.map((opt) => (
                      <MenuItem
                        key={opt.value}
                        active={frequency === opt.value}
                        onClick={() => {
                          setFreqOverride(opt.value)
                          if (opt.value !== 'weekly') setRepeatWeekdays([])
                        }}
                      >
                        {opt.label}
                      </MenuItem>
                    ))}
                    {frequency !== 'once' && frequency !== 'no_repeat' && (
                      <div className="border-t border-[var(--hairline)] px-3 py-2">
                        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                          Every
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={repeatEvery}
                            onChange={(e) =>
                              setRepeatEvery(Math.max(1, Number(e.target.value) || 1))
                            }
                            className="w-14 rounded-lg border border-[var(--hairline)] px-2 py-1 text-sm text-[var(--ink)]"
                          />
                        </label>
                        {frequency === 'weekly' && (
                          <div className="mt-2 flex gap-1">
                            {WEEKDAYS.map((w, i) => (
                              <button
                                key={`${w.d}-${i}`}
                                type="button"
                                onClick={() =>
                                  setRepeatWeekdays((prev) =>
                                    prev.includes(w.d)
                                      ? prev.filter((x) => x !== w.d)
                                      : [...prev, w.d].sort(),
                                  )
                                }
                                className={[
                                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium',
                                  repeatWeekdays.includes(w.d)
                                    ? 'bg-[var(--accent)] text-white'
                                    : 'bg-[var(--quiet)] text-[var(--muted)]',
                                ].join(' ')}
                              >
                                {w.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {formatPreviewDue(nextPreview) && (
                          <p className="mt-2 font-mono-meta text-[11px] text-[var(--muted)]">
                            {formatPreviewDue(nextPreview)}
                          </p>
                        )}
                      </div>
                    )}
                  </Menu>
                )}
              </div>
              <div className="relative">
                <Pill
                  active={priority > 0}
                  onClick={() => {
                    setPriorityOpen((v) => !v)
                    setRepeatOpen(false)
                    setDueOpen(false)
                    setLabelsOpen(false)
                    setProjectsOpen(false)
                  }}
                >
                  {priority > 0 ? `P${priority}` : 'Priority'}
                </Pill>
                {priorityOpen && (
                  <Menu onClose={() => setPriorityOpen(false)}>
                    {priorityOptions.map((opt) => (
                      <MenuItem
                        key={opt.value}
                        active={priority === opt.value}
                        onClick={() => {
                          setPrioOverride(opt.value)
                          setPriorityOpen(false)
                        }}
                      >
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Menu>
                )}
              </div>
              <div className="relative">
                <Pill
                  active={labelNames.length > 0}
                  onClick={() => {
                    setLabelsOpen((v) => !v)
                    setRepeatOpen(false)
                    setPriorityOpen(false)
                    setDueOpen(false)
                    setProjectsOpen(false)
                  }}
                >
                  {labelsPillText}
                </Pill>
                 {labelsOpen && (
                  <Menu onClose={() => setLabelsOpen(false)}>
                    <form
                      className="flex gap-2 p-1.5"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const name = labelDraft.replace(/^#/, '').trim()
                        if (!name) return
                        setManualLabelNames((prev) =>
                          prev.some((n) => n.toLowerCase() === name.toLowerCase())
                            ? prev
                            : [...prev, name],
                        )
                        setLabelDraft('')
                      }}
                    >
                      <input
                        value={labelDraft}
                        onChange={(e) => setLabelDraft(e.target.value)}
                        placeholder="#tag"
                        className="min-w-0 flex-1 rounded-lg border border-[var(--hairline)] px-2.5 py-1 text-xs"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white whitespace-nowrap"
                      >
                        {labelDraft.trim() &&
                        !labels.some(
                          (l) => l.name.toLowerCase() === labelDraft.replace(/^#/, '').trim().toLowerCase(),
                        )
                          ? `+ Create "#${labelDraft.replace(/^#/, '').trim()}"`
                          : 'Add'}
                      </button>
                    </form>
                    {labels.map((l) => (
                      <MenuItem
                        key={l.id}
                        active={labelNames.some(
                          (n) => n.toLowerCase() === l.name.toLowerCase(),
                        )}
                        onClick={() => {
                          const active = labelNames.some(
                            (n) => n.toLowerCase() === l.name.toLowerCase(),
                          )
                          if (active) {
                            setManualLabelNames((prev) =>
                              prev.filter(
                                (n) => n.toLowerCase() !== l.name.toLowerCase(),
                              ),
                            )
                            setExcludedLabelNames((prev) =>
                              prev.some(
                                (n) => n.toLowerCase() === l.name.toLowerCase(),
                              )
                                ? prev
                                : [...prev, l.name],
                            )
                          } else {
                            setExcludedLabelNames((prev) =>
                              prev.filter(
                                (n) => n.toLowerCase() !== l.name.toLowerCase(),
                              ),
                            )
                            setManualLabelNames((prev) =>
                              prev.some(
                                (n) => n.toLowerCase() === l.name.toLowerCase(),
                              )
                                ? prev
                                : [...prev, l.name],
                            )
                          }
                        }}
                      >
                        <span className="flex items-center gap-2"><Tag size={14} className="text-[var(--muted)]" /> {l.name}</span>
                      </MenuItem>
                    ))}
                  </Menu>
                )}
              </div>
              <div className="relative">
                <Pill
                  active={Boolean(activeProjectName)}
                  onClick={() => {
                    setProjectsOpen((v) => !v)
                    setLabelsOpen(false)
                    setRepeatOpen(false)
                    setPriorityOpen(false)
                    setDueOpen(false)
                  }}
                >
                  {activeProjectName ? `@${activeProjectName}` : 'Project'}
                </Pill>
                {projectsOpen && (
                  <Menu onClose={() => { setProjectsOpen(false); setProjectSearch(''); }}>
                    <div className="p-1.5">
                      <input
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Search or create project…"
                        className="w-full rounded-lg border border-[var(--hairline)] px-2.5 py-1 text-xs text-[var(--ink)] bg-[var(--surface)]"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {finalProjectId !== null && (
                        <MenuItem
                          active={false}
                          onClick={() => {
                            setProjectOverride(null)
                            setProjectsOpen(false)
                            setProjectSearch('')
                          }}
                        >
                          Remove from project
                        </MenuItem>
                      )}
                      {projects
                        .filter((p) =>
                          p.name.toLowerCase().includes(projectSearch.trim().toLowerCase()),
                        )
                        .map((p) => (
                          <MenuItem
                            key={p.id}
                            active={finalProjectId === p.id}
                            onClick={() => {
                              setProjectOverride(p.id)
                              setProjectsOpen(false)
                              setProjectSearch('')
                            }}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full mr-2 inline-block shrink-0"
                              style={{ backgroundColor: p.color }}
                            />
                            <span className="truncate">{p.name}</span>
                          </MenuItem>
                        ))}
                      {projectSearch.trim() &&
                        !projects.some(
                          (p) => p.name.toLowerCase() === projectSearch.trim().toLowerCase(),
                        ) && (
                          <button
                            type="button"
                            onClick={async () => {
                              const newId = await createProject(projectSearch.trim())
                              setProjectOverride(newId)
                              setProjectsOpen(false)
                              setProjectSearch('')
                            }}
                            className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-wash)] border-t border-[var(--hairline)]"
                          >
                            <Plus size={14} />
                            Create project "{projectSearch.trim()}"
                          </button>
                        )}
                    </div>
                  </Menu>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-3">
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-[var(--muted)]">Notes</p>
              <div className="rounded-[var(--radius-control)] border border-[var(--hairline)] px-3 py-2">
                <RichDescriptionEditor
                  key={`notes-${session}-${focusNotes ? 'f' : 'n'}`}
                  value={description}
                  onChange={setDescription}
                  autoFocus={focusNotes}
                  bare
                  placeholder="Optional details…"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-[12px] font-medium text-[var(--muted)]">Checklist</p>
                {subtasks.length > 0 && (
                  <span className="font-mono-meta text-[11px] text-[var(--muted)]">
                    {doneCount} / {subtasks.length}
                  </span>
                )}
              </div>
              <ul className="space-y-0.5">
                {subtasks.map((s) => (
                  <li key={s.id} className="group flex min-h-11 items-center gap-3">
                    <button
                      type="button"
                      aria-label={s.completed ? 'Mark incomplete' : 'Mark complete'}
                      onClick={() =>
                        setSubtasks((prev) =>
                          prev.map((x) =>
                            x.id === s.id ? { ...x, completed: !x.completed } : x,
                          ),
                        )
                      }
                      className={[
                        'focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                        s.completed
                          ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                          : 'border-[var(--hairline)]',
                      ].join(' ')}
                    >
                      {s.completed && <Check size={12} />}
                    </button>
                    <span
                      className={[
                        'min-w-0 flex-1 text-[15px]',
                        s.completed
                          ? 'text-[var(--muted)] line-through'
                          : 'text-[var(--ink)]',
                      ].join(' ')}
                    >
                      {s.title}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove"
                      className="rounded p-1 text-[var(--muted)] opacity-0 hover:text-[var(--danger)] group-hover:opacity-100"
                      onClick={() =>
                        setSubtasks((prev) => prev.filter((x) => x.id !== s.id))
                      }
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="mt-1 flex min-h-11 items-center gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  addSubtask()
                }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--accent)]">
                  <Plus size={16} />
                </span>
                <input
                  ref={subInputRef}
                  value={subDraft}
                  onChange={(e) => setSubDraft(e.target.value)}
                  placeholder="Add checklist item"
                  data-gramm="false"
                  className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
                />
              </form>
            </div>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-5 py-3">
          {isEdit &&
            (confirmDelete ? (
              <>
                <button
                  type="button"
                  className="focus-ring rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--quiet)]"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className="focus-ring rounded-lg bg-[var(--danger)] px-3 py-2 text-sm text-white"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              </>
            ) : (
              <button
                type="button"
                className="focus-ring rounded-lg px-3 py-2 text-sm text-[var(--danger)] hover:bg-red-50"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="focus-ring rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--quiet)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!rawTitle.trim()}
              onClick={() => void submit()}
              className="focus-ring inline-flex min-h-10 items-center rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-pressed)] disabled:opacity-40"
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>

      {dueOpen && (
        <DueDatePicker
          value={dueAt}
          onClose={() => setDueOpen(false)}
          onApply={(date) => {
            setDueOverride(date)
            setDueOpen(false)
          }}
        />
      )}
    </div>
  )
}


function Pill({
  children,
  active,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-2.5 py-1 text-[13px] transition',
        active
          ? 'border-[var(--accent)]/30 bg-[var(--accent-wash)] text-[var(--ink)]'
          : 'border-[var(--hairline)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Menu({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-10 cursor-default bg-transparent"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Close menu"
      />
      <div className="absolute top-full left-0 z-20 mt-2 w-64 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-1 shadow-sm">
        {children}
      </div>
    </>
  )
}

function MenuItem({
  children,
  onClick,
  active,
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'block w-full rounded-lg px-3 py-2 text-left text-sm',
        active
          ? 'bg-[var(--accent-wash)] font-medium text-[var(--ink)]'
          : 'text-[var(--ink)]/80 hover:bg-[var(--quiet)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
