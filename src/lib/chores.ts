import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { nextDueAfterComplete } from './scheduler'
import { defaultNotificationSettings, normalizeNotificationSettings } from './userSettings'
import type {
  Chore,
  ChoreCompleteSnapshot,
  Frequency,
  NotificationSettings,
  Priority,
  Subtask,
} from '../types/models'

function choresCol(uid: string) {
  return collection(getDb(), 'users', uid, 'chores')
}

function nowIso() {
  return new Date().toISOString()
}

export type ChoreInput = {
  title: string
  description?: string
  priority?: Priority
  dueAt?: string | null
  isRolling?: boolean
  frequency?: Frequency
  repeatEvery?: number
  repeatWeekdays?: number[]
  labelIds?: string[]
  subtasks?: Subtask[]
  reminderEnabled?: boolean
  predueHours?: number
  projectId?: string | null
}

export type ChoresSnapshotMeta = {
  fromCache: boolean
  hasPendingWrites: boolean
}

/** Single live listener - local cache serves reads after first sync. */
export function subscribeChores(
  uid: string,
  onData: (chores: Chore[], meta: ChoresSnapshotMeta) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(choresCol(uid), orderBy('updatedAt', 'desc'))
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const chores = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          repeatEvery: typeof data.repeatEvery === 'number' ? data.repeatEvery : 1,
          repeatWeekdays: Array.isArray(data.repeatWeekdays)
            ? data.repeatWeekdays
            : [],
        } as Chore
      })
      onData(chores, {
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      })
    },
    (err) => onError?.(err),
  )
}

function buildPayload(input: ChoreInput, stamp: string): Omit<Chore, 'id'> {
  return {
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    priority: input.priority ?? 0,
    status: 'none',
    dueAt: input.dueAt ?? null,
    isRolling: input.isRolling ?? true,
    frequency: input.frequency ?? 'once',
    repeatEvery: input.repeatEvery ?? 1,
    repeatWeekdays: input.repeatWeekdays ?? [],
    labelIds: input.labelIds ?? [],
    projectId: input.projectId ?? null,
    subtasks: input.subtasks ?? [],
    reminderEnabled: input.reminderEnabled ?? true,
    predueHours: input.predueHours ?? 24,
    archivedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
    lastCompletedAt: null,
  }
}

/** Client id + setDoc - UI can close before server ACK. */
export function createChore(
  uid: string,
  input: ChoreInput,
): { id: string; promise: Promise<void> } {
  const stamp = nowIso()
  const ref = doc(choresCol(uid))
  const payload = buildPayload(input, stamp)
  return {
    id: ref.id,
    promise: setDoc(ref, payload),
  }
}

export function updateChore(
  uid: string,
  choreId: string,
  patch: Partial<ChoreInput> & {
    archivedAt?: string | null
    status?: Chore['status']
    lastCompletedAt?: string | null
    lastDuePushAt?: string | null
    lastPreduePushAt?: string | null
    lastOverduePushAt?: string | null
  },
): Promise<void> {
  return updateDoc(doc(choresCol(uid), choreId), {
    ...patch,
    updatedAt: nowIso(),
  })
}

export function completeChore(
  uid: string,
  chore: Chore,
): { snapshot: ChoreCompleteSnapshot; promise: Promise<void>; nextDue: string | null } {
  const completedAt = new Date()
  const nextDue = nextDueAfterComplete(chore, completedAt)
  const stamp = completedAt.toISOString()
  const resetSubtasks = chore.subtasks.map((s) =>
    nextDue ? { ...s, completed: false, dueAt: null } : s,
  )
  const snapshot: ChoreCompleteSnapshot = {
    dueAt: chore.dueAt,
    archivedAt: chore.archivedAt,
    subtasks: chore.subtasks,
    lastCompletedAt: chore.lastCompletedAt,
    updatedAt: chore.updatedAt,
    status: chore.status,
  }
  return {
    snapshot,
    nextDue,
    promise: updateDoc(doc(choresCol(uid), chore.id), {
      dueAt: nextDue,
      lastCompletedAt: stamp,
      updatedAt: stamp,
      status: 'none',
      subtasks: resetSubtasks,
      archivedAt: nextDue ? null : stamp,
    }),
  }
}

export function undoCompleteChore(
  uid: string,
  choreId: string,
  snapshot: ChoreCompleteSnapshot,
): Promise<void> {
  return updateDoc(doc(choresCol(uid), choreId), {
    ...snapshot,
    updatedAt: nowIso(),
  })
}

export function deleteChore(uid: string, choreId: string): Promise<void> {
  return deleteDoc(doc(choresCol(uid), choreId))
}

export async function ensureUserProfile(
  uid: string,
  profile: {
    displayName: string | null
    email: string | null
    photoURL?: string | null
  },
) {
  const ref = doc(getDb(), 'users', uid)
  const existing = await getDoc(ref)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const patch: Record<string, unknown> = {
    displayName: profile.displayName,
    email: profile.email,
    photoURL: profile.photoURL ?? null,
    timezone,
    updatedAt: serverTimestamp(),
  }
  if (!existing.exists() || !existing.data()?.notificationSettings) {
    patch.notificationSettings = defaultNotificationSettings(timezone)
  }
  await setDoc(ref, patch, { merge: true })
}

export async function getNotificationSettings(
  uid: string,
): Promise<NotificationSettings> {
  const snap = await getDoc(doc(getDb(), 'users', uid))
  const raw = snap.data()?.notificationSettings as
    | Partial<NotificationSettings>
    | undefined
  return normalizeNotificationSettings(
    raw,
    snap.data()?.timezone as string | undefined,
  )
}

export async function saveNotificationSettings(
  uid: string,
  settings: NotificationSettings,
): Promise<void> {
  await setDoc(
    doc(getDb(), 'users', uid),
    {
      notificationSettings: settings,
      timezone: settings.timezone,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export function toggleSubtask(
  uid: string,
  chore: Chore,
  subtaskId: string,
): Promise<void> {
  const subtasks = chore.subtasks.map((s) =>
    s.id === subtaskId ? { ...s, completed: !s.completed } : s,
  )
  return updateDoc(doc(choresCol(uid), chore.id), {
    subtasks,
    updatedAt: nowIso(),
  })
}

export function updateSubtask(
  uid: string,
  chore: Chore,
  subtaskId: string,
  updates: Partial<Subtask>,
): Promise<void> {
  const subtasks = chore.subtasks.map((s) =>
    s.id === subtaskId ? { ...s, ...updates } : s,
  )
  return updateDoc(doc(choresCol(uid), chore.id), {
    subtasks,
    updatedAt: nowIso(),
  })
}

export function deleteSubtask(
  uid: string,
  chore: Chore,
  subtaskId: string,
): Promise<void> {
  const subtasks = chore.subtasks.filter((s) => s.id !== subtaskId)
  return updateDoc(doc(choresCol(uid), chore.id), {
    subtasks,
    updatedAt: nowIso(),
  })
}

/**
 * Expands active chores to also include open checklist items as tasks in the task stream.
 * Checklist items inherit parent task's project, labels, priority, and default due date (unless overridden).
 */
export function expandChoresWithSubtasks(chores: Chore[]): Chore[] {
  const result: Chore[] = []
  for (const chore of chores) {
    if (chore.archivedAt) continue
    result.push(chore)

    if (chore.subtasks && chore.subtasks.length > 0) {
      for (const subtask of chore.subtasks) {
        if (subtask.completed) continue
        const effectiveDueAt =
          subtask.dueAt !== undefined && subtask.dueAt !== null
            ? subtask.dueAt
            : chore.dueAt

        result.push({
          id: `subtask:${chore.id}:${subtask.id}`,
          title: subtask.title,
          description: '',
          priority: chore.priority,
          status: 'none',
          dueAt: effectiveDueAt,
          isRolling: chore.isRolling,
          frequency: 'once',
          repeatEvery: 1,
          repeatWeekdays: [],
          labelIds: chore.labelIds,
          projectId: chore.projectId,
          subtasks: [],
          reminderEnabled: false,
          predueHours: 24,
          archivedAt: null,
          createdAt: chore.createdAt,
          updatedAt: chore.updatedAt,
          lastCompletedAt: null,
          isSubtask: true,
          parentChoreId: chore.id,
          parentChoreTitle: chore.title,
          subtaskId: subtask.id,
        })
      }
    }
  }
  return result
}

