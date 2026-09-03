import { useState, useMemo, useEffect } from 'react'
import {
  DndContext,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  DragOverlay
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addDays,
  subDays,
  parseISO
} from 'date-fns'
import type { Chore, Label } from '../types/models'
import { useProjects } from '../hooks/useProjects'
import { ChoreRow } from './ChoreRow'
import { ChevronLeft, ChevronRight, Plus } from './icons'

type Props = {
  mode: 'month' | 'week'
  chores: Chore[]
  onOpenEdit: (chore: Chore) => void
  onOpenCreate: (initialDue?: Date) => void
  onComplete: (chore: Chore) => void
  onUpdateTask: (id: string, updates: Partial<Chore>) => void
  onActiveDateChange: (date: Date | null) => void
  pendingIds: Set<string>
  exiting: Set<string>
  completing: Set<string>
  labelsById: Map<string, Label>
}

function DraggableChore({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  const style = {
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="touch-manipulation">
      {children}
    </div>
  )
}

function DroppableDay({
  id,
  day,
  isSelected,
  isCurrentMonth,
  today,
  dayChores,
  onClick
}: {
  id: string
  day: Date
  isSelected: boolean
  isCurrentMonth: boolean
  today: boolean
  dayChores: Chore[]
  onClick: () => void
}) {
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={[
        'relative flex flex-col items-center pt-1 pb-2 rounded-xl transition-colors min-h-[44px]',
        isSelected ? 'bg-[var(--ink)] text-white' : 'hover:bg-[var(--quiet)]',
        !isSelected && today ? 'text-[var(--accent)] font-bold' : '',
        !isSelected && !today && !isCurrentMonth ? 'text-[var(--muted)] opacity-50' : '',
        !isSelected && !today && isCurrentMonth ? 'text-[var(--ink)]' : '',
        isOver && !isSelected ? 'bg-[var(--quiet)] ring-2 ring-[var(--accent)]' : '',
        isOver && isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--surface)]' : ''
      ].join(' ')}
    >
      <span className="text-sm leading-none mt-1">{format(day, 'd')}</span>
      
      {dayChores.length > 0 && (
        <div className="flex gap-0.5 mt-1">
          {dayChores.slice(0, 3).map((c, j) => {
            const color = c.priority > 0 ? 'bg-[var(--due-soon)]' : (isSelected ? 'bg-white' : 'bg-[var(--accent)]')
            return (
              <div key={j} className={`w-1 h-1 rounded-full ${color}`} />
            )
          })}
          {dayChores.length > 3 && (
            <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/50' : 'bg-[var(--muted)]'}`} />
          )}
        </div>
      )}
    </button>
  )
}

export function CalendarView({
  mode,
  chores,
  onOpenEdit,
  onOpenCreate,
  onComplete,
  onUpdateTask,
  onActiveDateChange,
  pendingIds,
  exiting,
  completing,
  labelsById
}: Props) {
  const { projects } = useProjects()
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [activeTab, setActiveTab] = useState<'scheduled' | 'unscheduled'>('scheduled')
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  useEffect(() => {
    onActiveDateChange(activeTab === 'scheduled' ? selectedDate : null)
  }, [selectedDate, activeTab, onActiveDateChange])

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  
  const prevWeek = () => setSelectedDate(subDays(selectedDate, 7))
  const nextWeek = () => setSelectedDate(addDays(selectedDate, 7))

  // Keyboard shortcuts (T = Today, J = Next, K = Prev)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      if (typing || e.metaKey || e.ctrlKey) return

      if (e.key.toLowerCase() === 't') {
        e.preventDefault()
        const now = new Date()
        setSelectedDate(now)
        setCurrentMonth(startOfMonth(now))
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault()
        if (mode === 'week') nextWeek()
        else nextMonth()
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (mode === 'week') prevWeek()
        else prevMonth()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, selectedDate, currentMonth])

  const days = useMemo(() => {
    if (mode === 'week') {
      const start = startOfWeek(selectedDate)
      const end = endOfWeek(selectedDate)
      return eachDayOfInterval({ start, end })
    }
    const start = startOfWeek(startOfMonth(currentMonth))
    const end = endOfWeek(endOfMonth(currentMonth))
    return eachDayOfInterval({ start, end })
  }, [mode, currentMonth, selectedDate])

  const choresByDay = useMemo(() => {
    const map = new Map<string, Chore[]>()
    for (const c of chores) {
      if (!c.dueAt) continue
      const dateKey = format(parseISO(c.dueAt), 'yyyy-MM-dd')
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)!.push(c)
    }
    return map
  }, [chores])

  const selectedTasks = useMemo(() => {
    const key = format(selectedDate, 'yyyy-MM-dd')
    return choresByDay.get(key) || []
  }, [choresByDay, selectedDate])

  const unscheduledTasks = useMemo(() => {
    return chores.filter(c => !c.dueAt)
  }, [chores])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require dragging 8px before drag starts, allows clicking
      },
    }),
    useSensor(KeyboardSensor)
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null)
    const { active, over } = event
    
    if (!over) return

    const choreId = active.id as string
    const targetDate = over.id as string // we will pass yyyy-MM-dd as the droppable ID

    if (targetDate) {
      // Find the chore
      const chore = chores.find(c => c.id === choreId)
      if (!chore) return
      
      const newDue = parseISO(targetDate)
      // We set the time to 12:00 PM as a safe default for a dragged task
      newDue.setHours(12, 0, 0, 0)
      
      onUpdateTask(choreId, { dueAt: newDue.toISOString() })
      setSelectedDate(parseISO(targetDate))
      setActiveTab('scheduled')
    }
  }

  const activeDragChore = useMemo(() => {
    if (!activeDragId) return null
    return chores.find(c => c.id === activeDragId) || null
  }, [activeDragId, chores])

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full pb-6">
        <div className="section-block p-4 flex flex-col items-center shadow-[var(--shadow-card)] z-10 sticky top-0 bg-[var(--surface)]">
        {/* Header */}
        <div className="flex w-full items-center justify-between mb-4">
          <button
            type="button"
            onClick={mode === 'week' ? prevWeek : prevMonth}
            className="p-2 rounded-full hover:bg-[var(--quiet)] text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
            {mode === 'week' ? format(selectedDate, 'MMMM yyyy') : format(currentMonth, 'MMMM yyyy')}
          </h2>
          <button
            type="button"
            onClick={mode === 'week' ? nextWeek : nextMonth}
            className="p-2 rounded-full hover:bg-[var(--quiet)] text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Days of week */}
        <div className="grid grid-cols-7 w-full mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-center font-mono-meta text-[11px] font-semibold text-[var(--muted)]">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 w-full gap-1">
              {days.map((day, i) => {
                const dateKey = format(day, 'yyyy-MM-dd')
                const dayChores = choresByDay.get(dateKey) || []
                
                return (
                  <DroppableDay
                    key={i}
                    id={dateKey}
                    day={day}
                    isSelected={isSameDay(day, selectedDate)}
                    isCurrentMonth={isSameMonth(day, currentMonth)}
                    today={isToday(day)}
                    dayChores={dayChores}
                    onClick={() => setSelectedDate(day)}
                  />
                )
              })}
        </div>
      </div>

      <div className="flex-1 mt-6">
        <div className="px-4 mb-4 flex border-b border-[var(--hairline)]">
          <button
            type="button"
            className={`pb-2 px-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'scheduled'
                ? 'border-[var(--ink)] text-[var(--ink)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
            onClick={() => setActiveTab('scheduled')}
          >
            {format(selectedDate, 'MMM d')}
          </button>
          <button
            type="button"
            className={`pb-2 px-2 ml-4 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'unscheduled'
                ? 'border-[var(--ink)] text-[var(--ink)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
            onClick={() => setActiveTab('unscheduled')}
          >
            Unscheduled
          </button>
        </div>

        <div className="px-2">
          {activeTab === 'scheduled' && (
            <>
              {selectedTasks.length === 0 ? (
                <div className="text-center py-10 text-[var(--muted)] text-sm">
                  No tasks scheduled for this day.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedTasks.map(chore => (
                    <DraggableChore key={chore.id} id={chore.id}>
                      <ChoreRow
                        chore={chore}
                        labels={chore.labelIds.map(id => labelsById.get(id)).filter(Boolean) as Label[]}
                        project={chore.projectId ? projects.find(p => p.id === chore.projectId) || null : null}
                        pending={pendingIds.has(chore.id)}
                        exiting={exiting.has(chore.id)}
                        completing={completing.has(chore.id)}
                        onOpen={() => onOpenEdit(chore)}
                        onComplete={() => onComplete(chore)}
                      />
                    </DraggableChore>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => onOpenCreate(selectedDate)}
                className="focus-ring mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-[var(--hairline)] text-sm font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Plus size={16} />
                Add task to {format(selectedDate, 'MMM d')}
              </button>
            </>
          )}

          {activeTab === 'unscheduled' && (
            <>
              {unscheduledTasks.length === 0 ? (
                <div className="text-center py-10 text-[var(--muted)] text-sm">
                  No unscheduled tasks found.
                </div>
              ) : (
                <div className="space-y-2">
                  {unscheduledTasks.map(chore => (
                    <DraggableChore key={chore.id} id={chore.id}>
                      <ChoreRow
                        chore={chore}
                        labels={chore.labelIds.map(id => labelsById.get(id)).filter(Boolean) as Label[]}
                        project={chore.projectId ? projects.find(p => p.id === chore.projectId) || null : null}
                        pending={pendingIds.has(chore.id)}
                        exiting={exiting.has(chore.id)}
                        completing={completing.has(chore.id)}
                        onOpen={() => onOpenEdit(chore)}
                        onComplete={() => onComplete(chore)}
                      />
                    </DraggableChore>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    <DragOverlay>
        {activeDragChore ? (
          <div className="opacity-90 shadow-2xl scale-105 cursor-grabbing bg-[var(--surface)] rounded-[var(--radius-card)] pointer-events-none rotate-2">
            <ChoreRow
              chore={activeDragChore}
              labels={activeDragChore.labelIds.map(id => labelsById.get(id)).filter(Boolean) as Label[]}
              project={activeDragChore.projectId ? projects.find(p => p.id === activeDragChore.projectId) || null : null}
              pending={false}
              exiting={false}
              completing={false}
              onOpen={() => {}}
              onComplete={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
