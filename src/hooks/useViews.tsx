import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createView, deleteView, subscribeViews } from '../lib/views'
import type { CustomView, Priority } from '../types/models'
import { useAuth } from './useAuth'

type ViewsContextValue = {
  views: CustomView[]
  ready: boolean
  byId: Map<string, CustomView>
  create: (name: string, priorities: Priority[], labelIds: string[]) => Promise<string>
  remove: (id: string) => Promise<void>
}

const ViewsContext = createContext<ViewsContextValue | null>(null)

export function ViewsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [views, setViews] = useState<CustomView[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!user) {
      setViews([])
      setReady(false)
      return
    }
    return subscribeViews(
      user.uid,
      (next) => {
        setViews(next)
        setReady(true)
      },
      () => setReady(true),
    )
  }, [user])

  const byId = useMemo(() => new Map(views.map((v) => [v.id, v])), [views])

  const create = useCallback(
    async (name: string, priorities: Priority[], labelIds: string[]) => {
      if (!user) return ''
      const view = await createView(user.uid, name, priorities, labelIds)
      return view.id
    },
    [user],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!user) return
      await deleteView(user.uid, id)
    },
    [user],
  )

  const value = useMemo(
    () => ({ views, ready, byId, create, remove }),
    [byId, create, remove, ready, views],
  )

  return (
    <ViewsContext.Provider value={value}>{children}</ViewsContext.Provider>
  )
}

export function useViews() {
  const ctx = useContext(ViewsContext)
  if (!ctx) throw new Error('useViews must be used within ViewsProvider')
  return ctx
}
