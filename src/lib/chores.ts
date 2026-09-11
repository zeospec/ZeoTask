import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { nextDueAfterComplete, isChoreAllDay } from './scheduler'
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
  isAllDay?: boolean
  isRolling?: boolean
  frequency?: Frequency
  repeatEvery?: number
  repeatWeekdays?: number[]
  labelIds?: string[]
  subtasks?: Subtask[]
  reminderEnabled?: boolean
  predueHours?: number
  projectId?: string | null
  gcalEventId?: string | null
  gcalLastSyncedAt?: string | null
}

export type ChoresSnapshotMeta = {
  fromCache: boolean
  hasPendingWrites: boolean
}

/** Active tasks live listener - excludes archived/completed tasks to minimize read costs. */
export function subscribeChores(
  uid: string,
  onData: (chores: Chore[], meta: ChoresSnapshotMeta) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(choresCol(uid), where('archivedAt', '==', null))
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
      chores.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      onData(chores, {
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      })
    },
    (err) => onError?.(err),
  )
}

/** Paginated completed / archived tasks listener for CompletedPage. */
export function subscribeCompletedChores(
  uid: string,
  limitCount: number,
  onData: (chores: Chore[], hasMore: boolean) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    choresCol(uid),
    where('archivedAt', '!=', null),
    orderBy('archivedAt', 'desc'),
    limit(limitCount),
  )
  return onSnapshot(
    q,
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
      const hasMore = snap.docs.length >= limitCount
      onData(chores, hasMore)
    },
    (err) => onError?.(err),
  )
}

export function computeNextReminderAt(
  chore: {
    dueAt?: string | null
    reminderEnabled?: boolean
    predueHours?: number
    archivedAt?: string | null
    lastDuePushAt?: string | null
    lastPreduePushAt?: string | null
    lastOverduePushAt?: string | null
  },
  now = new Date(),
): string | null {
  if (chore.archivedAt || chore.reminderEnabled === false || !chore.dueAt) {
    return null
  }
  const dueMs = Date.parse(chore.dueAt)
  if (Number.isNaN(dueMs)) return null

  const nowMs = now.getTime()
  const predueHours = chore.predueHours ?? 24
  const predueMs = dueMs - predueHours * 3600 * 1000
  const overdueMs = dueMs + 2 * 3600 * 1000

  // 1. Pre-due reminder: fires predueHours before due, as long as due date is still ahead
  if (!chore.lastPreduePushAt && predueHours > 0 && dueMs > nowMs) {
    return new Date(predueMs).toISOString()
  }

  // 2. Due reminder: fires at dueAt
  if (!chore.lastDuePushAt && overdueMs > nowMs) {
    return new Date(dueMs).toISOString()
  }

  // 3. Overdue nudge: fires 2 hours after dueAt (within a 24-hour grace window)
  if (!chore.lastOverduePushAt && overdueMs > nowMs - 24 * 3600 * 1000) {
    return new Date(overdueMs).toISOString()
  }

  return null
}

function buildPayload(input: ChoreInput, stamp: string): Omit<Chore, 'id'> {
  const reminderEnabled = input.reminderEnabled ?? true
  const predueHours = input.predueHours ?? 24
  const dueAt = input.dueAt ?? null
  const isAllDay = input.isAllDay !== undefined ? input.isAllDay : isChoreAllDay({ dueAt, isAllDay: input.isAllDay })
  const nextReminderAt = computeNextReminderAt({
    dueAt,
    reminderEnabled,
    predueHours,
    archivedAt: null,
  })

  return {
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    priority: input.priority ?? 0,
    status: 'none',
    dueAt,
    isAllDay,
    isRolling: input.isRolling ?? true,
    frequency: input.frequency ?? 'once',
    repeatEvery: input.repeatEvery ?? 1,
    repeatWeekdays: input.repeatWeekdays ?? [],
    labelIds: input.labelIds ?? [],
    projectId: input.projectId ?? null,
    subtasks: input.subtasks ?? [],
    reminderEnabled,
    predueHours,
    nextReminderAt,
    lastDuePushAt: null,
    lastPreduePushAt: null,
    lastOverduePushAt: null,
    gcalEventId: input.gcalEventId ?? null,
    gcalLastSyncedAt: input.gcalLastSyncedAt ?? null,
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
    nextReminderAt?: string | null
    isAllDay?: boolean
    gcalEventId?: string | null
    gcalLastSyncedAt?: string | null
  },
  existingChore?: Chore,
): Promise<void> {
  const finalPatch: Record<string, unknown> = {
    ...patch,
    updatedAt: nowIso(),
  }

  if ('dueAt' in patch && patch.dueAt && !('isAllDay' in patch)) {
    finalPatch.isAllDay = isChoreAllDay({ dueAt: patch.dueAt })
  }

  // If dueAt, reminderEnabled, or predueHours changed, recompute nextReminderAt
  if (existingChore) {
    if (
      'dueAt' in patch ||
      'reminderEnabled' in patch ||
      'predueHours' in patch ||
      'archivedAt' in patch ||
      'isAllDay' in patch
    ) {
      const merged = { ...existingChore, ...patch }
      if ('dueAt' in patch && patch.dueAt !== existingChore.dueAt) {
        merged.lastDuePushAt = null
        merged.lastPreduePushAt = null
        merged.lastOverduePushAt = null
        finalPatch.lastDuePushAt = null
        finalPatch.lastPreduePushAt = null
        finalPatch.lastOverduePushAt = null
      }
      finalPatch.nextReminderAt = computeNextReminderAt(merged)
    }
  } else if ('dueAt' in patch || 'reminderEnabled' in patch || 'predueHours' in patch) {
    if (patch.dueAt === null || patch.reminderEnabled === false || patch.archivedAt) {
      finalPatch.nextReminderAt = null
    } else if (patch.dueAt) {
      finalPatch.nextReminderAt = computeNextReminderAt({
        dueAt: patch.dueAt,
        reminderEnabled: patch.reminderEnabled ?? true,
        predueHours: patch.predueHours ?? 24,
      })
    }
  }

  return updateDoc(doc(choresCol(uid), choreId), finalPatch)
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
    isAllDay: chore.isAllDay,
    archivedAt: chore.archivedAt,
    subtasks: chore.subtasks,
    lastCompletedAt: chore.lastCompletedAt,
    updatedAt: chore.updatedAt,
    status: chore.status,
  }

  const nextReminderAt = nextDue
    ? computeNextReminderAt({
        dueAt: nextDue,
        reminderEnabled: chore.reminderEnabled,
        predueHours: chore.predueHours,
        archivedAt: null,
      })
    : null

  return {
    snapshot,
    nextDue,
    promise: updateDoc(doc(choresCol(uid), chore.id), {
      dueAt: nextDue ?? chore.dueAt,
      lastCompletedAt: stamp,
      updatedAt: stamp,
      status: 'none',
      subtasks: resetSubtasks,
      archivedAt: nextDue ? null : stamp,
      nextReminderAt,
      lastDuePushAt: null,
      lastPreduePushAt: null,
      lastOverduePushAt: null,
    }),
  }
}

export function undoCompleteChore(
  uid: string,
  choreId: string,
  snapshot: ChoreCompleteSnapshot,
): Promise<void> {
  const nextReminderAt = computeNextReminderAt({
    dueAt: snapshot.dueAt,
    archivedAt: snapshot.archivedAt,
  })
  return updateDoc(doc(choresCol(uid), choreId), {
    ...snapshot,
    nextReminderAt,
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

        const effectiveIsAllDay =
          subtask.dueAt !== undefined && subtask.dueAt !== null
            ? isChoreAllDay(subtask)
            : isChoreAllDay(chore)

        result.push({
          id: `subtask:${chore.id}:${subtask.id}`,
          title: subtask.title,
          description: '',
          priority: chore.priority,
          status: 'none',
          dueAt: effectiveDueAt,
          isAllDay: effectiveIsAllDay,
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

