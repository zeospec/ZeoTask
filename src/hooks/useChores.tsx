import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  completeChore as completeChoreWrite,
  createChore as createChoreWrite,
  deleteChore as deleteChoreWrite,
  subscribeChores,
  undoCompleteChore,
  updateChore as updateChoreWrite,
  type ChoreInput,
} from '../lib/chores'
import { moveDueToToday, isChoreAllDay } from '../lib/scheduler'
import type { Chore, ChoreCompleteSnapshot, Subtask } from '../types/models'
import { getSyncCoordinator } from '../lib/syncCoordinator'
import { useAuth } from './useAuth'

export type ToastAction = {
  label: string
  onClick: () => void
}

export type Toast = {
  id: string
  message: string
  action?: ToastAction
}

type ChoresContextValue = {
  chores: Chore[]
  ready: boolean
  error: string | null
  pendingIds: Set<string>
  syncing: boolean
  fromCache: boolean
  toasts: Toast[]
  announce: string
  dismissToast: (id: string) => void
  pushToast: (message: string, action?: ToastAction) => void
  announceLive: (message: string) => void
  createTask: (input: ChoreInput) => string
  updateTask: (
    choreId: string,
    patch: Parameters<typeof updateChoreWrite>[2],
    existingChore?: Chore,
  ) => void
  completeTask: (chore: Chore) => void
  deleteTask: (choreId: string, title?: string, gcalEventId?: string | null) => void
  moveOverdueToToday: (chores: Chore[]) => void
  completeSubtask: (parentChoreId: string, subtaskId: string) => void
  updateSubtaskItem: (parentChoreId: string, subtaskId: string, updates: Partial<Subtask>) => void
  deleteSubtaskItem: (parentChoreId: string, subtaskId: string) => void
  runWrite: (choreId: string, promise: Promise<void>, failMessage: string) => void
}

const ChoresContext = createContext<ChoresContextValue | null>(null)

export function ChoresProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [chores, setChores] = useState<Chore[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [syncing, setSyncing] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [announce, setAnnounce] = useState('')
  const undoRef = useRef<Map<string, ChoreCompleteSnapshot>>(new Map())
  const choresRef = useRef(chores)
  choresRef.current = chores

  useEffect(() => {
    if (!user) {
      setChores([])
      setReady(false)
      setSyncing(false)
      setFromCache(false)
      return
    }
    return subscribeChores(
      user.uid,
      (next, meta) => {
        setChores(next)
        getSyncCoordinator(user.uid).setLocalChores(next)
        setReady(true)
        setError(null)
        setSyncing(meta.hasPendingWrites)
        setFromCache(meta.fromCache)
      },
      (err) => setError(err.message),
    )
  }, [user])

  useEffect(() => {
    if (!user) return
    const coordinator = getSyncCoordinator(user.uid)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void coordinator.triggerSync('visibility-change', choresRef.current)
      }
    }
    const onWindowFocus = () => {
      void coordinator.triggerSync('window-focus', choresRef.current)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onWindowFocus)

    void coordinator.triggerSync('app-init', choresRef.current)

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void coordinator.triggerSync('interval', choresRef.current)
      }
    }, 5 * 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onWindowFocus)
      clearInterval(interval)
    }
  }, [user])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback(
    (message: string, action?: ToastAction) => {
      const id = crypto.randomUUID()
      setToasts((prev) => [...prev.filter((t) => !t.action), { id, message, action }])
      window.setTimeout(() => dismissToast(id), action ? 6500 : 4000)
    },
    [dismissToast],
  )

  const announceLive = useCallback((message: string) => {
    setAnnounce('')
    requestAnimationFrame(() => setAnnounce(message))
  }, [])

  const markPending = useCallback((choreId: string, isPending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (isPending) next.add(choreId)
      else next.delete(choreId)
      return next
    })
  }, [])

  const runWrite = useCallback(
    (choreId: string, promise: Promise<void>, failMessage: string) => {
      markPending(choreId, true)
      promise
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : failMessage
          pushToast(msg)
          announceLive(msg)
        })
        .finally(() => markPending(choreId, false))
    },
    [announceLive, markPending, pushToast],
  )

  const createTask = useCallback(
    (input: ChoreInput) => {
      if (!user) return ''
      const { id, promise } = createChoreWrite(user.uid, input)
      runWrite(id, promise, 'Could not create task')
      announceLive(`Created ${input.title}`)

      const stamp = new Date().toISOString()
      const choreMock: Chore = {
        id,
        title: input.title,
        description: input.description ?? '',
        priority: input.priority ?? 0,
        status: 'none',
        dueAt: input.dueAt ?? null,
        isAllDay: input.isAllDay,
        isRolling: input.isRolling ?? true,
        frequency: input.frequency ?? 'once',
        repeatEvery: input.repeatEvery ?? 1,
        repeatWeekdays: input.repeatWeekdays ?? [],
        labelIds: input.labelIds ?? [],
        projectId: input.projectId ?? null,
        subtasks: input.subtasks ?? [],
        reminderEnabled: input.reminderEnabled ?? true,
        predueHours: input.predueHours ?? 24,
        nextReminderAt: null,
        lastDuePushAt: null,
        lastPreduePushAt: null,
        lastOverduePushAt: null,
        gcalEventId: null,
        gcalLastSyncedAt: null,
        archivedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
        lastCompletedAt: null,
      }
      getSyncCoordinator(user.uid).enqueueOutboundChore(choreMock)

      return id
    },
    [announceLive, runWrite, user],
  )

  const updateTask = useCallback(
    (
      choreId: string,
      patch: Parameters<typeof updateChoreWrite>[2],
      existingChore?: Chore,
    ) => {
      if (!user) return
      const existing = existingChore ?? chores.find((c) => c.id === choreId)
      runWrite(
        choreId,
        updateChoreWrite(user.uid, choreId, patch, existing),
        'Could not save task',
      )
      if (existing) {
        if (patch.subtasks && existing.subtasks) {
          const nextSubIds = new Set(patch.subtasks.map((s) => s.id))
          for (const oldSub of existing.subtasks) {
            if (oldSub.gcalEventId && !nextSubIds.has(oldSub.id)) {
              void getSyncCoordinator(user.uid).handleDeleteChore(oldSub.gcalEventId)
            }
          }
        }
        const merged = { ...existing, ...patch, updatedAt: new Date().toISOString() }
        getSyncCoordinator(user.uid).enqueueOutboundChore(merged)
      }
      announceLive('Task saved')
    },
    [announceLive, chores, runWrite, user],
  )

  const completeTask = useCallback(
    (chore: Chore) => {
      if (!user) return
      const { snapshot, promise, nextDue } = completeChoreWrite(user.uid, chore)
      undoRef.current.set(chore.id, snapshot)
      runWrite(chore.id, promise, 'Could not complete task')

      const coordinator = getSyncCoordinator(user.uid)
      void coordinator.handleCompleteChore(chore, nextDue)

      const title = chore.title
      announceLive(`Completed ${title}`)
      pushToast('Task marked complete', {
        label: 'Undo',
        onClick: () => {
          const snap = undoRef.current.get(chore.id)
          if (!snap || !user) return
          undoRef.current.delete(chore.id)
          runWrite(
            chore.id,
            undoCompleteChore(user.uid, chore.id, snap),
            'Could not undo',
          )
          announceLive(`Undid complete for ${title}`)

          // Restore to Google Calendar if uncompleted task has a due date
          if (snap.dueAt && !snap.archivedAt) {
            getSyncCoordinator(user.uid).enqueueOutboundChore({
              ...chore,
              ...snap,
              updatedAt: new Date().toISOString(),
            })
          }
        },
      })
      void nextDue
    },
    [announceLive, pushToast, runWrite, user],
  )

  const deleteTask = useCallback(
    (choreId: string, title?: string, gcalEventId?: string | null) => {
      if (!user) return
      const existing = chores.find((c) => c.id === choreId)
      const eventId = gcalEventId || existing?.gcalEventId
      const coordinator = getSyncCoordinator(user.uid)
      if (eventId) {
        void coordinator.handleDeleteChore(eventId)
      }
      if (existing?.subtasks) {
        for (const s of existing.subtasks) {
          if (s.gcalEventId) {
            void coordinator.handleDeleteChore(s.gcalEventId)
          }
        }
      }
      runWrite(choreId, deleteChoreWrite(user.uid, choreId), 'Could not delete task')
      announceLive(title ? `Deleted ${title}` : 'Task deleted')
    },
    [announceLive, chores, runWrite, user],
  )

  const moveOverdueToToday = useCallback(
    (overdue: Chore[]) => {
      if (!user || overdue.length === 0) return
      const now = new Date()

      // Track updates per chore ID to avoid conflicting writes
      const chorePatches = new Map<string, Parameters<typeof updateChoreWrite>[2]>()
      // Track updated subtasks per parent chore ID: parentId -> (subtaskId -> nextDue)
      const parentSubtaskUpdates = new Map<string, Map<string, string>>()

      for (const item of overdue) {
        if (!item.dueAt) continue
        const nextDue = moveDueToToday(item.dueAt, now)
        const isAllDay = isChoreAllDay(item)

        if (item.isSubtask && item.parentChoreId && item.subtaskId) {
          let subMap = parentSubtaskUpdates.get(item.parentChoreId)
          if (!subMap) {
            subMap = new Map()
            parentSubtaskUpdates.set(item.parentChoreId, subMap)
          }
          subMap.set(item.subtaskId, nextDue)
        } else {
          chorePatches.set(item.id, {
            dueAt: nextDue,
            isAllDay,
            lastDuePushAt: null,
            lastPreduePushAt: null,
            lastOverduePushAt: null,
          })
        }
      }

      // Apply parent chore updates
      for (const [choreId, patch] of chorePatches.entries()) {
        const subUpdates = parentSubtaskUpdates.get(choreId)
        if (subUpdates) {
          const parent = chores.find((c) => c.id === choreId)
          if (parent) {
            patch.subtasks = parent.subtasks.map((s) =>
              subUpdates.has(s.id)
                ? { ...s, dueAt: subUpdates.get(s.id)!, isAllDay: isChoreAllDay(s) }
                : s,
            )
          }
          parentSubtaskUpdates.delete(choreId)
        }
        const parent = chores.find((c) => c.id === choreId)
        runWrite(choreId, updateChoreWrite(user.uid, choreId, patch, parent), 'Could not move task')
        if (parent) {
          getSyncCoordinator(user.uid).enqueueOutboundChore({
            ...parent,
            ...patch,
            updatedAt: new Date().toISOString(),
          })
        }
      }

      // Apply remaining subtask-only updates to parent chores
      for (const [parentChoreId, subUpdates] of parentSubtaskUpdates.entries()) {
        const parent = chores.find((c) => c.id === parentChoreId)
        if (parent) {
          const nextSubtasks = parent.subtasks.map((s) =>
            subUpdates.has(s.id)
              ? { ...s, dueAt: subUpdates.get(s.id)!, isAllDay: isChoreAllDay(s) }
              : s,
          )
          runWrite(
            parentChoreId,
            updateChoreWrite(user.uid, parentChoreId, { subtasks: nextSubtasks }),
            'Could not move checklist items',
          )
          getSyncCoordinator(user.uid).enqueueOutboundChore({
            ...parent,
            subtasks: nextSubtasks,
            updatedAt: new Date().toISOString(),
          })
        }
      }

      const n = overdue.length
      pushToast(
        n === 1 ? '1 task moved to today' : `${n} tasks moved to today`,
      )
      announceLive(
        n === 1 ? 'Moved 1 overdue task to today' : `Moved ${n} overdue tasks to today`,
      )
    },
    [announceLive, chores, pushToast, runWrite, user],
  )

  const completeSubtask = useCallback(
    (parentChoreId: string, subtaskId: string) => {
      if (!user) return
      const parent = chores.find((c) => c.id === parentChoreId)
      if (!parent) return
      const sub = parent.subtasks.find((s) => s.id === subtaskId)
      if (!sub) return

      const prevSubtasks = parent.subtasks
      const nextSubtasks = parent.subtasks.map((s) =>
        s.id === subtaskId ? { ...s, completed: true } : s,
      )

      runWrite(
        parentChoreId,
        updateChoreWrite(user.uid, parentChoreId, { subtasks: nextSubtasks }),
        'Could not complete checklist item',
      )

      getSyncCoordinator(user.uid).enqueueOutboundChore({
        ...parent,
        subtasks: nextSubtasks,
        updatedAt: new Date().toISOString(),
      })

      announceLive(`Completed ${sub.title}`)
      pushToast('Checklist item marked complete', {
        label: 'Undo',
        onClick: () => {
          if (!user) return
          runWrite(
            parentChoreId,
            updateChoreWrite(user.uid, parentChoreId, { subtasks: prevSubtasks }),
            'Could not undo',
          )
          getSyncCoordinator(user.uid).enqueueOutboundChore({
            ...parent,
            subtasks: prevSubtasks,
            updatedAt: new Date().toISOString(),
          })
          announceLive(`Undid complete for ${sub.title}`)
        },
      })
    },
    [announceLive, chores, pushToast, runWrite, user],
  )

  const updateSubtaskItem = useCallback(
    (parentChoreId: string, subtaskId: string, updates: Partial<Subtask>) => {
      if (!user) return
      const parent = chores.find((c) => c.id === parentChoreId)
      if (!parent) return

      const nextSubtasks = parent.subtasks.map((s) =>
        s.id === subtaskId ? { ...s, ...updates } : s,
      )

      runWrite(
        parentChoreId,
        updateChoreWrite(user.uid, parentChoreId, { subtasks: nextSubtasks }),
        'Could not update checklist item',
      )
      getSyncCoordinator(user.uid).enqueueOutboundChore({
        ...parent,
        subtasks: nextSubtasks,
        updatedAt: new Date().toISOString(),
      })
      announceLive('Checklist item updated')
    },
    [announceLive, chores, runWrite, user],
  )

  const deleteSubtaskItem = useCallback(
    (parentChoreId: string, subtaskId: string) => {
      if (!user) return
      const parent = chores.find((c) => c.id === parentChoreId)
      if (!parent) return

      const sub = parent.subtasks.find((s) => s.id === subtaskId)
      if (sub?.gcalEventId) {
        void getSyncCoordinator(user.uid).handleDeleteChore(sub.gcalEventId)
      }

      const nextSubtasks = parent.subtasks.filter((s) => s.id !== subtaskId)

      runWrite(
        parentChoreId,
        updateChoreWrite(user.uid, parentChoreId, { subtasks: nextSubtasks }),
        'Could not delete checklist item',
      )
      getSyncCoordinator(user.uid).enqueueOutboundChore({
        ...parent,
        subtasks: nextSubtasks,
        updatedAt: new Date().toISOString(),
      })
      announceLive('Checklist item removed')
    },
    [announceLive, chores, runWrite, user],
  )

  const value = useMemo<ChoresContextValue>(
    () => ({
      chores,
      ready,
      error,
      pendingIds,
      syncing,
      fromCache,
      toasts,
      announce,
      dismissToast,
      pushToast,
      announceLive,
      createTask,
      updateTask,
      completeTask,
      deleteTask,
      moveOverdueToToday,
      completeSubtask,
      updateSubtaskItem,
      deleteSubtaskItem,
      runWrite,
    }),
    [
      announce,
      announceLive,
      chores,
      completeSubtask,
      completeTask,
      createTask,
      deleteSubtaskItem,
      deleteTask,
      dismissToast,
      error,
      fromCache,
      moveOverdueToToday,
      pendingIds,
      pushToast,
      ready,
      runWrite,
      syncing,
      toasts,
      updateSubtaskItem,
      updateTask,
    ],
  )

  return <ChoresContext.Provider value={value}>{children}</ChoresContext.Provider>
}

export function useChores() {
  const ctx = useContext(ChoresContext)
  if (!ctx) throw new Error('useChores must be used within ChoresProvider')
  return ctx
}
