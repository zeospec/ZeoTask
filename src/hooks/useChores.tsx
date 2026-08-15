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
import { moveDueToToday } from '../lib/scheduler'
import type { Chore, ChoreCompleteSnapshot } from '../types/models'
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
  updateTask: (choreId: string, patch: Parameters<typeof updateChoreWrite>[2]) => void
  completeTask: (chore: Chore) => void
  deleteTask: (choreId: string, title?: string) => void
  moveOverdueToToday: (chores: Chore[]) => void
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
        setReady(true)
        setError(null)
        setSyncing(meta.hasPendingWrites)
        setFromCache(meta.fromCache)
      },
      (err) => setError(err.message),
    )
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

  const markPending = useCallback((id: string, on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const runWrite = useCallback(
    (choreId: string, promise: Promise<void>, failMessage: string) => {
      markPending(choreId, true)
      void promise
        .catch((err) => {
          const msg = err instanceof Error ? err.message : failMessage
          pushToast(msg)
          announceLive(failMessage)
          setError(msg)
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
      return id
    },
    [announceLive, runWrite, user],
  )

  const updateTask = useCallback(
    (choreId: string, patch: Parameters<typeof updateChoreWrite>[2]) => {
      if (!user) return
      runWrite(
        choreId,
        updateChoreWrite(user.uid, choreId, patch),
        'Could not save task',
      )
      announceLive('Task saved')
    },
    [announceLive, runWrite, user],
  )

  const completeTask = useCallback(
    (chore: Chore) => {
      if (!user) return
      const { snapshot, promise, nextDue } = completeChoreWrite(user.uid, chore)
      undoRef.current.set(chore.id, snapshot)
      runWrite(chore.id, promise, 'Could not complete task')

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
        },
      })
      void nextDue
    },
    [announceLive, pushToast, runWrite, user],
  )

  const deleteTask = useCallback(
    (choreId: string, title?: string) => {
      if (!user) return
      runWrite(choreId, deleteChoreWrite(user.uid, choreId), 'Could not delete task')
      announceLive(title ? `Deleted ${title}` : 'Task deleted')
    },
    [announceLive, runWrite, user],
  )

  const moveOverdueToToday = useCallback(
    (overdue: Chore[]) => {
      if (!user || overdue.length === 0) return
      const now = new Date()
      for (const chore of overdue) {
        if (!chore.dueAt) continue
        const nextDue = moveDueToToday(chore.dueAt, now)
        runWrite(
          chore.id,
          updateChoreWrite(user.uid, chore.id, {
            dueAt: nextDue,
            lastDuePushAt: null,
            lastPreduePushAt: null,
            lastOverduePushAt: null,
          }),
          'Could not move task',
        )
      }
      const n = overdue.length
      pushToast(
        n === 1 ? '1 task moved to today' : `${n} tasks moved to today`,
      )
      announceLive(
        n === 1 ? 'Moved 1 overdue task to today' : `Moved ${n} overdue tasks to today`,
      )
    },
    [announceLive, pushToast, runWrite, user],
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
      runWrite,
    }),
    [
      announce,
      announceLive,
      chores,
      completeTask,
      createTask,
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
