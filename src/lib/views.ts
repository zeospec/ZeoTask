import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
} from 'firebase/firestore'
import { getDb } from './firebase'
import type { CustomView, Priority } from '../types/models'

export function subscribeViews(
  uid: string,
  onUpdate: (views: CustomView[]) => void,
  onError: (err: Error) => void,
) {
  const db = getDb()
  const q = query(collection(db, 'users', uid, 'views'))
  return onSnapshot(
    q,
    (snap) => {
      const docs: CustomView[] = []
      for (const d of snap.docs) {
        docs.push(d.data() as CustomView)
      }
      onUpdate(docs)
    },
    onError,
  )
}

export async function createView(
  uid: string,
  name: string,
  priorities: Priority[],
  labelIds: string[],
) {
  const db = getDb()
  const ref = doc(collection(db, 'users', uid, 'views'))
  const now = new Date().toISOString()
  const payload: CustomView = {
    id: ref.id,
    name,
    priorities,
    labelIds,
    createdAt: now,
    updatedAt: now,
  }
  await setDoc(ref, payload)
  return payload
}

export async function deleteView(uid: string, viewId: string) {
  const db = getDb()
  const ref = doc(db, 'users', uid, 'views', viewId)
  await deleteDoc(ref)
}
