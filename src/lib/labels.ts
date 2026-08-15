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
import type { Label } from '../types/models'

const LABEL_COLORS = [
  '#315F55',
  '#6B7D91',
  '#A85B00',
  '#0F766E',
  '#B84C43',
  '#4A6670',
]

function labelsCol(uid: string) {
  return collection(getDb(), 'users', uid, 'labels')
}

function nowIso() {
  return new Date().toISOString()
}

export function subscribeLabels(
  uid: string,
  onData: (labels: Label[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(labelsCol(uid), orderBy('name', 'asc'))
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Label))
    },
    (err) => onError?.(err),
  )
}

export function createLabel(
  uid: string,
  name: string,
  color?: string,
): { id: string; promise: Promise<void> } {
  const stamp = nowIso()
  const ref = doc(labelsCol(uid))
  const payload: Omit<Label, 'id'> = {
    name: name.trim().replace(/^#/, ''),
    color: color ?? LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)],
    createdAt: stamp,
    updatedAt: stamp,
  }
  return { id: ref.id, promise: setDoc(ref, payload) }
}

export function renameLabel(uid: string, id: string, name: string): Promise<void> {
  return updateDoc(doc(labelsCol(uid), id), {
    name: name.trim().replace(/^#/, ''),
    updatedAt: nowIso(),
  })
}

export function deleteLabel(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(labelsCol(uid), id))
}

/** Resolve names to ids; create missing labels. Returns labelIds. */
export async function ensureLabelIds(
  uid: string,
  names: string[],
  existing: Label[],
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
    const { id, promise } = createLabel(uid, name)
    await promise
    ids.push(id)
    existing.push({
      id,
      name,
      color: LABEL_COLORS[0],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  }
  return ids
}
