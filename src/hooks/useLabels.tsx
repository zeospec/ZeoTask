import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  createLabel,
  deleteLabel,
  renameLabel,
  subscribeLabels,
} from '../lib/labels'
import type { Label } from '../types/models'
import { useAuth } from './useAuth'

type LabelsContextValue = {
  labels: Label[]
  ready: boolean
  byId: Map<string, Label>
  create: (name: string) => Promise<string>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

const LabelsContext = createContext<LabelsContextValue | null>(null)

export function LabelsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [labels, setLabels] = useState<Label[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!user) {
      setLabels([])
      setReady(false)
      return
    }
    return subscribeLabels(
      user.uid,
      (next) => {
        setLabels(next)
        setReady(true)
      },
      () => setReady(true),
    )
  }, [user])

  const byId = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])

  const create = useCallback(
    async (name: string) => {
      if (!user) return ''
      const { id, promise } = createLabel(user.uid, name)
      await promise
      return id
    },
    [user],
  )

  const rename = useCallback(
    async (id: string, name: string) => {
      if (!user) return
      await renameLabel(user.uid, id, name)
    },
    [user],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!user) return
      await deleteLabel(user.uid, id)
    },
    [user],
  )

  const value = useMemo(
    () => ({ labels, ready, byId, create, rename, remove }),
    [byId, create, labels, ready, remove, rename],
  )

  return (
    <LabelsContext.Provider value={value}>{children}</LabelsContext.Provider>
  )
}

export function useLabels() {
  const ctx = useContext(LabelsContext)
  if (!ctx) throw new Error('useLabels must be used within LabelsProvider')
  return ctx
}
