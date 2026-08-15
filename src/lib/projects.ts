import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import type { Project } from '../types/models'

export const PROJECT_COLORS = [
  '#315F55',
  '#6B7D91',
  '#A85B00',
  '#0F766E',
  '#B84C43',
  '#4A6670',
]

function projectsCol(uid: string) {
  return collection(getDb(), 'users', uid, 'projects')
}

function nowIso() {
  return new Date().toISOString()
}

export function subscribeProjects(
  uid: string,
  onData: (projects: Project[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(projectsCol(uid), orderBy('name', 'asc'))
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project))
    },
    (err) => onError?.(err),
  )
}

export function createProject(
  uid: string,
  name: string,
  color?: string,
): { id: string; promise: Promise<void> } {
  const stamp = nowIso()
  const ref = doc(projectsCol(uid))
  const payload: Omit<Project, 'id'> = {
    name: name.trim().replace(/^#/, ''),
    color: color ?? PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
    createdAt: stamp,
    updatedAt: stamp,
  }
  return { id: ref.id, promise: setDoc(ref, payload) }
}

export function updateProject(
  uid: string,
  id: string,
  updates: { name?: string; color?: string },
): Promise<void> {
  const payload: any = { updatedAt: nowIso() }
  if (updates.name !== undefined) {
    payload.name = updates.name.trim().replace(/^#/, '')
  }
  if (updates.color !== undefined) {
    payload.color = updates.color
  }
  return updateDoc(doc(projectsCol(uid), id), payload)
}

export function deleteProject(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(projectsCol(uid), id))
}

/** Resolve names to ids; create missing projects. Returns projectIds. */
export async function ensureProjectIds(
  uid: string,
  names: string[],
  existing: Project[],
): Promise<string[]> {
  const ids: string[] = []
  const lower = (s: string) => s.trim().replace(/^#/, '').toLowerCase()
  for (const raw of names) {
    const name = raw.trim().replace(/^#/, '')
    if (!name) continue
    const found = existing.find((l) => lower(l.name) === lower(name))
    if (found) {
      ids.push(found.id)
      continue
    }
    const { id, promise } = createProject(uid, name)
    await promise
    ids.push(id)
    existing.push({
      id,
      name,
      color: PROJECT_COLORS[0],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  }
  return ids
}
