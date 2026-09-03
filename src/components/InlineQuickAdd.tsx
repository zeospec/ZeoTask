import { useState } from 'react'
import { format, isTomorrow, isToday } from 'date-fns'
import { SmartTaskTitleInput } from './SmartTaskTitleInput'
import { useAuth } from '../hooks/useAuth'
import { useChores } from '../hooks/useChores'
import { useLabels } from '../hooks/useLabels'
import { useProjects } from '../hooks/useProjects'
import { parseSmartTitle, type SmartParseResult } from '../lib/taskParsers'
import { ensureLabelIds } from '../lib/labels'
import { X, Plus, Tag } from './icons'

type Props = {
  activeProjectId?: string | null
  activeLabelId?: string | null
  onExpand: (initialTitle: string, overrides?: { projectId: string | null; manualLabels: string[]; ignoredTokens: { text: string; kind: string }[] }) => void
}

export function InlineQuickAdd({ activeProjectId, activeLabelId, onExpand }: Props) {
  const { user } = useAuth()
  const { createTask } = useChores()
  const { labels, create: createLabel } = useLabels()
  const { projects, create: createProject } = useProjects()
  
  const [rawTitle, setRawTitle] = useState('')
  const [parsed, setParsed] = useState<SmartParseResult>(() => parseSmartTitle(''))
  const [ignoredTokens, setIgnoredTokens] = useState<{text: string; kind: string}[]>([])
  const [focused, setFocused] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Autocomplete state
  const [atMenuOpen, setAtMenuOpen] = useState(false)
  const [atQuery, setAtQuery] = useState('')
  const [hashMenuOpen, setHashMenuOpen] = useState(false)
  const [hashQuery, setHashQuery] = useState('')

  // Overrides
  const [projectOverride, setProjectOverride] = useState<string | null>(null)
  const [manualLabelNames, setManualLabelNames] = useState<string[]>([])

  const finalDue = parsed.dueAt
  const finalFreq = parsed.frequency
  const finalPrio = parsed.priority

  async function handleSubmit() {
    if (!user || !rawTitle.trim() || submitting) return
    setSubmitting(true)

    const combinedLabels = Array.from(new Set([...parsed.labelNames, ...manualLabelNames]))
    if (activeLabelId) {
      const activeLbl = labels.find((l) => l.id === activeLabelId)
      if (activeLbl && !combinedLabels.includes(activeLbl.name)) {
        combinedLabels.push(activeLbl.name)
      }
    }
    const labelIds = await ensureLabelIds(user.uid, combinedLabels, [...labels])

    createTask({
      title: parsed.cleanedTitle || 'Untitled',
      description: '',
      dueAt: finalDue ? finalDue.toISOString() : null,
      frequency: finalFreq || 'once',
      repeatEvery: 1,
      repeatWeekdays: [],
      priority: finalPrio || 0,
      labelIds,
      projectId: projectOverride || activeProjectId || null,
      subtasks: [],
    })

    setRawTitle('')
    setParsed(parseSmartTitle(''))
    setIgnoredTokens([])
    setProjectOverride(null)
    setManualLabelNames([])
    setSubmitting(false)
    setFocused(false)
  }

  const hasNLP = parsed.dueAt || (parsed.frequency !== 'once') || parsed.priority > 0 || parsed.labelNames.length > 0 || manualLabelNames.length > 0 || projectOverride
  const showChips = Boolean(hasNLP)

  const activeProject = projectOverride ? projects.find(p => p.id === projectOverride) : undefined

  return (
    <div className="mx-auto max-w-[680px]">
      {showChips && (
        <div className="mb-2 flex flex-wrap gap-1.5 px-4">
          {finalDue && (
            <span className="flex items-center gap-1 rounded-full bg-[var(--accent-wash)] px-2.5 py-0.5 font-mono-meta text-[11px] font-medium text-[var(--accent)]">
              {isToday(finalDue)
                ? `Today · ${format(finalDue, 'h:mm a')}`
                : isTomorrow(finalDue)
                  ? `Tomorrow · ${format(finalDue, 'h:mm a')}`
                  : format(finalDue, 'MMM d · h:mm a')}
              <button
                type="button"
                className="ml-0.5 rounded-full hover:bg-[var(--accent)]/10"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const h = parsed.highlights.find(x => x.kind === 'due')
                  if (h) {
                    const newIgnored = [...ignoredTokens, { text: h.text, kind: 'due' }]
                    setIgnoredTokens(newIgnored)
                    setParsed(parseSmartTitle(rawTitle, newIgnored.map(t => t.text)))
                  }
                }}
              >
                <X size={10} />
              </button>
            </span>
          )}
          {finalFreq && finalFreq !== 'once' && (
            <span className="flex items-center gap-1 rounded-full bg-[var(--accent-wash)] px-2.5 py-0.5 font-mono-meta text-[11px] font-medium text-[var(--accent)]">
              {finalFreq}
              <button
                type="button"
                className="ml-0.5 rounded-full hover:bg-[var(--accent)]/10"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const h = parsed.highlights.find(x => x.kind === 'repeat')
                  if (h) {
                    const newIgnored = [...ignoredTokens, { text: h.text, kind: 'repeat' }]
                    setIgnoredTokens(newIgnored)
                    setParsed(parseSmartTitle(rawTitle, newIgnored.map(t => t.text)))
                  }
                }}
              >
                <X size={10} />
              </button>
            </span>
          )}
          {finalPrio > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 font-mono-meta text-[11px] font-medium text-orange-800">
              P{finalPrio}
              <button
                type="button"
                className="ml-0.5 rounded-full hover:bg-orange-200"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const h = parsed.highlights.find(x => x.kind === 'priority')
                  if (h) {
                    const newIgnored = [...ignoredTokens, { text: h.text, kind: 'priority' }]
                    setIgnoredTokens(newIgnored)
                    setParsed(parseSmartTitle(rawTitle, newIgnored.map(t => t.text)))
                  }
                }}
              >
                <X size={10} />
              </button>
            </span>
          ) : null}
          {activeProject && (
            <span className="flex items-center gap-1 rounded-full bg-[var(--quiet)] px-2.5 py-0.5 font-mono-meta text-[11px] font-medium text-[var(--ink)]">
              @{activeProject.name}
              <button
                type="button"
                className="ml-0.5 rounded-full hover:bg-[var(--hairline)]"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setProjectOverride(null)
                }}
              >
                <X size={10} />
              </button>
            </span>
          )}
          {parsed.labelNames.map((l) => (
            <span
              key={l}
              className="flex items-center gap-1 rounded-full bg-[var(--quiet)] px-2.5 py-0.5 font-mono-meta text-[11px] font-medium text-[var(--ink)]"
            >
              <Tag size={12} className="text-[var(--muted)]" />
              {l}
              <button
                type="button"
                className="ml-0.5 rounded-full hover:bg-[var(--hairline)]"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const h = parsed.highlights.find(x => x.kind === 'label' && x.text.toLowerCase() === `#${l.toLowerCase()}`)
                  if (h) {
                    const newIgnored = [...ignoredTokens, { text: h.text, kind: 'label' }]
                    setIgnoredTokens(newIgnored)
                    setParsed(parseSmartTitle(rawTitle, newIgnored.map(t => t.text)))
                  }
                }}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {manualLabelNames.map((l) => (
            <span
              key={`manual-${l}`}
              className="flex items-center gap-1 rounded-full bg-[var(--quiet)] px-2.5 py-0.5 font-mono-meta text-[11px] font-medium text-[var(--ink)]"
            >
              <Tag size={12} className="text-[var(--muted)]" />
              {l}
              <button
                type="button"
                className="ml-0.5 rounded-full hover:bg-[var(--hairline)]"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setManualLabelNames(prev => prev.filter(n => n !== l))
                }}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <div
          className={[
            'focus-ring flex min-h-11 items-center rounded-[var(--radius-control)] border bg-[var(--surface)] px-4 transition-colors',
            focused ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/20' : 'border-[var(--hairline)]',
          ].join(' ')}
        >
          <div 
            className="flex-1 py-2" 
            onFocus={() => setFocused(true)} 
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                // Give time for clicks on the dropdown menu to process
                setTimeout(() => setFocused(false), 150)
              }
            }}
          >
          <SmartTaskTitleInput
            value={rawTitle}
            onChange={(val) => {
              setRawTitle(val)
              setParsed(parseSmartTitle(val, ignoredTokens.map(t => t.text)))
            }}
            onParsed={(p) => setParsed(p)}
            onSubmit={handleSubmit}
            placeholder="Type a task and hit Enter..."
            autoFocus={false}
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
        {rawTitle.trim() && (
          <button
            type="button"
            onClick={handleSubmit}
            className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-all hover:opacity-90 active:scale-95"
            title="Add task"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const labelsToSend = [...manualLabelNames]
            if (activeLabelId) {
              const activeLbl = labels.find((l) => l.id === activeLabelId)
              if (activeLbl && !labelsToSend.includes(activeLbl.name)) {
                labelsToSend.push(activeLbl.name)
              }
            }
            onExpand(rawTitle, {
              projectId: projectOverride || activeProjectId || null,
              manualLabels: labelsToSend,
              ignoredTokens,
            })
            setRawTitle('')
            setParsed(parseSmartTitle(''))
            setIgnoredTokens([])
            setProjectOverride(null)
            setManualLabelNames([])
          }}
          className="ml-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)] transition-colors"
          title="Open full editor"
        >
          <Plus size={16} />
        </button>
      </div>

      {atMenuOpen && (() => {
        const filtered = projects.filter((p) => p.name.toLowerCase().includes(atQuery.toLowerCase()))
        const showCreate = atQuery.trim() && !projects.some((p) => p.name.toLowerCase() === atQuery.trim().toLowerCase())
        const showEmpty = projects.length === 0 && !atQuery.trim()
        if (!filtered.length && !showCreate && !showEmpty) return null

        return (
          <div className="absolute left-0 right-0 bottom-full z-50 mb-1 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] shadow-lg overflow-hidden">
            <div className="max-h-44 overflow-y-auto py-1">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
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
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            {atQuery.trim() && !projects.some((p) => p.name.toLowerCase() === atQuery.trim().toLowerCase()) && (
              <button
                type="button"
                onMouseDown={async (e) => {
                  e.preventDefault()
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

      {hashMenuOpen && (() => {
        const filtered = labels.filter((l) => l.name.toLowerCase().includes(hashQuery.toLowerCase()))
        const showCreate = hashQuery.trim() && !labels.some((l) => l.name.toLowerCase() === hashQuery.trim().toLowerCase())
        const showEmpty = labels.length === 0 && !hashQuery.trim()
        if (!filtered.length && !showCreate && !showEmpty) return null

        return (
          <div className="absolute left-0 right-0 bottom-full z-50 mb-1 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] shadow-lg overflow-hidden">
            <div className="max-h-44 overflow-y-auto py-1">
              {filtered.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
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
                  <span className="truncate flex items-center gap-2"><Tag size={14} className="text-[var(--muted)]" /> {l.name}</span>
                </button>
              ))}
            {hashQuery.trim() && !labels.some((l) => l.name.toLowerCase() === hashQuery.trim().toLowerCase()) && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
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
                Create "{hashQuery.trim()}"
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
    </div>
  )
}
