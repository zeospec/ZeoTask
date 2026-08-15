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
  createProject,
  deleteProject,
  updateProject,
  subscribeProjects,
} from '../lib/projects'
import type { Project } from '../types/models'
import { useAuth } from './useAuth'

type ProjectsContextValue = {
  projects: Project[]
  ready: boolean
  byId: Map<string, Project>
  create: (name: string) => Promise<string>
  update: (id: string, updates: { name?: string; color?: string }) => Promise<void>
  remove: (id: string) => Promise<void>
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null)

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!user) {
      setProjects([])
      setReady(false)
      return
    }
    return subscribeProjects(
      user.uid,
      (next) => {
        setProjects(next)
        setReady(true)
      },
      () => setReady(true),
    )
  }, [user])

  const byId = useMemo(() => new Map(projects.map((l) => [l.id, l])), [projects])

  const create = useCallback(
    async (name: string) => {
      if (!user) return ''
      const { id, promise } = createProject(user.uid, name)
      await promise
      return id
    },
    [user],
  )

  const update = useCallback(
    async (id: string, updates: { name?: string; color?: string }) => {
      if (!user) return
      await updateProject(user.uid, id, updates)
    },
    [user],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!user) return
      await deleteProject(user.uid, id)
    },
    [user],
  )

  const value = useMemo(
    () => ({ projects, ready, byId, create, update, remove }),
    [byId, create, projects, ready, remove, update],
  )

  return (
    <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>
  )
}

export function useProjects() {
  const ctx = useContext(ProjectsContext)
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider')
  return ctx
}
