import { doc, getDoc, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDb, getFirebaseFunctions } from './firebase'
import {
  cleanGCalTitle,
  deleteTaskFromGCal,
  extractGCalDescription,
  listAllActiveGCalEvents,
  pullGCalEvents,
  pushSubtaskToGCal,
  pushTaskToGCal,
  type GCalEvent,
} from './gcal'
import { createChore, deleteChore, updateChore } from './chores'
import type { Chore, GCalIntegrationDoc } from '../types/models'

const INTEGRATION_DOC = 'googleCalendar'

/** Reads Google Calendar integration document from Firestore. */
export async function getGCalIntegration(uid: string): Promise<GCalIntegrationDoc | null> {
  try {
    const snap = await getDoc(doc(getDb(), 'users', uid, 'integrations', INTEGRATION_DOC))
    if (!snap.exists()) return null
    return snap.data() as GCalIntegrationDoc
  } catch (err) {
    console.error('Failed to read GCal integration doc:', err)
    return null
  }
}

/** Updates Google Calendar integration document in Firestore. */
export async function saveGCalIntegration(
  uid: string,
  patch: Partial<GCalIntegrationDoc>,
): Promise<void> {
  try {
    await setDoc(doc(getDb(), 'users', uid, 'integrations', INTEGRATION_DOC), patch, {
      merge: true,
    })
  } catch (err) {
    console.error('Failed to save GCal integration doc:', err)
  }
}

/**
 * Checks token expiry and returns a valid access token.
 * Proactively refreshes via Cloud Functions when expired, expiring within 10 minutes,
 * or when forceRefresh is requested. Automatically self-heals if previously flagged.
 */
export async function getValidGCalAccessToken(
  uid: string,
  forceRefresh: boolean = false,
): Promise<{
  accessToken: string
  calendarId: string
} | null> {
  const integration = await getGCalIntegration(uid)
  if (!integration || !integration.enabled || !integration.calendarId) {
    return null
  }

  const { accessToken, expiresAt, calendarId, needsReauth } = integration
  const now = Date.now()

  // If token is still valid (> 10 minutes remaining), not forced, and not flagged for reauth, return it directly
  if (!forceRefresh && !needsReauth && accessToken && expiresAt && expiresAt > now + 10 * 60 * 1000) {
    return { accessToken, calendarId }
  }

  // Attempt backend token refresh via Cloud Functions (which securely holds client_id & client_secret)
  try {
    const refreshCallable = httpsCallable<{ forceRefresh?: boolean }, { accessToken?: string }>(
      getFirebaseFunctions(),
      'gcalRefreshToken',
    )
    const res = await refreshCallable({ forceRefresh: forceRefresh || Boolean(needsReauth) })
    if (res.data?.accessToken) {
      const newExpiresAt = Date.now() + 3500 * 1000
      await saveGCalIntegration(uid, {
        accessToken: res.data.accessToken,
        expiresAt: newExpiresAt,
        needsReauth: false,
        lastAuthError: null,
      })
      return { accessToken: res.data.accessToken, calendarId }
    }
  } catch (refreshErr: any) {
    console.warn('Backend token refresh failed:', refreshErr)
    // ONLY flag needsReauth if Google's OAuth endpoint explicitly returned invalid_grant
    if (refreshErr?.message?.includes('invalid_grant')) {
      await saveGCalIntegration(uid, {
        needsReauth: true,
        lastAuthError: 'REVOKED',
      })
      return null
    }
  }

  // If backend refresh was unavailable (e.g. temporary offline), but current access token is not expired, use it
  if (accessToken && (!expiresAt || expiresAt > now) && !needsReauth) {
    return { accessToken, calendarId }
  }

  return null
}

/**
 * Serialized Sync Coordinator to guarantee:
 * 1. Zero race conditions (mutex ensures serialized passes)
 * 2. Zero overlapping syncs (coalesces triggers during in-flight runs)
 * 3. Outbound debounce with flush-before-pull
 * 4. Tombstone registry to prevent deleted tasks from resurrecting
 * 5. Causal versioning & Anti-echo filtering
 */
export class SyncCoordinator {
  private uid: string
  private isRunning = false
  private pendingRerun = false
  private pendingReason = new Set<string>()
  private outboundDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private pendingOutboundChores = new Map<string, Chore>()
  private tombstones = new Set<string>()
  private tombstonesLoaded = false
  private cachedChores: Chore[] = []

  constructor(uid: string) {
    this.uid = uid
  }

  /** Keeps live local chores updated from React state / Firestore snapshots. */
  setLocalChores(chores: Chore[]): void {
    if (chores && chores.length > 0) {
      this.cachedChores = chores
    }
  }

  /**
   * Loads tombstone IDs from Firestore to ensure resurrection prevention
   * survives app restarts.
   */
  private async loadTombstones(): Promise<void> {
    if (this.tombstonesLoaded) return
    const integration = await getGCalIntegration(this.uid)
    if (integration?.tombstones) {
      integration.tombstones.forEach((id) => this.tombstones.add(id))
    }
    this.tombstonesLoaded = true
  }

  /**
   * Registers a deleted GCal event ID in the tombstone store.
   */
  async recordTombstone(gcalEventId: string): Promise<void> {
    await this.loadTombstones()
    this.tombstones.add(gcalEventId)
    // Keep max 500 tombstones in persistent storage
    const trimmed = Array.from(this.tombstones).slice(-500)
    await saveGCalIntegration(this.uid, { tombstones: trimmed })
  }

  /**
   * Enqueues an outbound chore push with an 800ms debounce.
   * If rapid edits happen, only the final settled state is pushed to Google Calendar.
   */
  enqueueOutboundChore(chore: Chore): void {
    // Cancel any existing debounce timer for this chore
    const existingTimer = this.outboundDebounceTimers.get(chore.id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    this.pendingOutboundChores.set(chore.id, chore)

    const timer = setTimeout(() => {
      this.outboundDebounceTimers.delete(chore.id)
      const latestChore = this.pendingOutboundChores.get(chore.id)
      this.pendingOutboundChores.delete(chore.id)
      if (latestChore) {
        void this.pushSingleChore(latestChore)
      }
    }, 800)

    this.outboundDebounceTimers.set(chore.id, timer)
  }

  /**
   * Flushes all pending debounced outbound changes immediately.
   * Crucial: Always called before an inbound sync pass to prevent local edits
   * from being overwritten by stale remote state.
   */
  private async flushOutboundQueue(): Promise<void> {
    for (const [, timer] of this.outboundDebounceTimers) {
      clearTimeout(timer)
    }
    this.outboundDebounceTimers.clear()

    const choresToPush = Array.from(this.pendingOutboundChores.values())
    this.pendingOutboundChores.clear()

    for (const chore of choresToPush) {
      await this.pushSingleChore(chore)
    }
  }

  /**
   * Pushes a single chore to Google Calendar.
   */
  private async pushSingleChore(chore: Chore, retryCount = 0): Promise<void> {
    try {
      const auth = await getValidGCalAccessToken(this.uid, retryCount > 0)
      if (!auth) return

      const integration = await getGCalIntegration(this.uid)
      const completedBehavior = integration?.completedTaskBehavior ?? 'keep'

      // Case 1: If chore has no due date, remove from Google Calendar
      if (!chore.dueAt) {
        if (chore.gcalEventId) {
          await this.handleDeleteChore(chore.gcalEventId)
          await updateChore(
            this.uid,
            chore.id,
            {
              gcalEventId: null,
              gcalLastSyncedAt: new Date().toISOString(),
            },
            chore,
          )
        }
        return
      }

      // Case 2: If chore is archived/completed and user selected 'remove', remove from Google Calendar
      if (chore.archivedAt && completedBehavior === 'remove') {
        if (chore.gcalEventId) {
          await this.handleDeleteChore(chore.gcalEventId)
          await updateChore(
            this.uid,
            chore.id,
            {
              gcalEventId: null,
              gcalLastSyncedAt: new Date().toISOString(),
            },
            chore,
          )
        }
        return
      }

      // Case 3: Push to Google Calendar (active, or completed with 'keep' behavior)
      const { gcalEventId, updated } = await pushTaskToGCal(
        chore,
        auth.calendarId,
        auth.accessToken,
      )

      // Record gcalEventId and synced timestamp back to Firestore chore if changed
      let currentChore = chore
      if (chore.gcalEventId !== gcalEventId || chore.gcalLastSyncedAt !== updated) {
        await updateChore(
          this.uid,
          chore.id,
          {
            gcalEventId,
            gcalLastSyncedAt: updated,
          },
          chore,
        )
        currentChore = { ...chore, gcalEventId, gcalLastSyncedAt: updated }
      }

      // Sync subtasks with deadlines to Google Calendar
      if (currentChore.subtasks && currentChore.subtasks.length > 0) {
        let subtasksModified = false
        const nextSubtasks = [...currentChore.subtasks]

        for (let i = 0; i < nextSubtasks.length; i++) {
          const s = nextSubtasks[i]
          const isDone = Boolean(s.completed || currentChore.archivedAt)

          if (s.dueAt) {
            if (isDone) {
              if (completedBehavior === 'keep') {
                if (s.gcalEventId) {
                  try {
                    const res = await pushSubtaskToGCal(s, currentChore, auth.calendarId, auth.accessToken)
                    if (s.gcalEventId !== res.gcalEventId || s.gcalLastSyncedAt !== res.updated) {
                      nextSubtasks[i] = {
                        ...s,
                        gcalEventId: res.gcalEventId,
                        gcalLastSyncedAt: res.updated,
                      }
                      subtasksModified = true
                    }
                  } catch (sErr) {
                    console.warn(`Failed outbound push for completed subtask ${s.id}:`, sErr)
                  }
                }
              } else {
                // completedBehavior === 'remove'
                if (s.gcalEventId) {
                  await this.handleDeleteChore(s.gcalEventId)
                  nextSubtasks[i] = {
                    ...s,
                    gcalEventId: null,
                    gcalLastSyncedAt: new Date().toISOString(),
                  }
                  subtasksModified = true
                }
              }
            } else {
              // Active subtask
              try {
                const res = await pushSubtaskToGCal(s, currentChore, auth.calendarId, auth.accessToken)
                if (s.gcalEventId !== res.gcalEventId || s.gcalLastSyncedAt !== res.updated) {
                  nextSubtasks[i] = {
                    ...s,
                    gcalEventId: res.gcalEventId,
                    gcalLastSyncedAt: res.updated,
                  }
                  subtasksModified = true
                }
              } catch (sErr) {
                console.warn(`Failed outbound push for subtask ${s.id}:`, sErr)
              }
            }
          } else if (s.gcalEventId) {
            // Due date removed from subtask
            await this.handleDeleteChore(s.gcalEventId)
            nextSubtasks[i] = {
              ...s,
              gcalEventId: null,
              gcalLastSyncedAt: new Date().toISOString(),
            }
            subtasksModified = true
          }
        }

        if (subtasksModified) {
          await updateChore(this.uid, currentChore.id, { subtasks: nextSubtasks }, currentChore)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (retryCount === 0 && (msg === 'UNAUTHORIZED' || msg.includes('401'))) {
        console.warn(`401 on outbound push for chore ${chore.id}. Forcing token refresh and retrying once...`)
        return this.pushSingleChore(chore, 1)
      }
      console.warn(`Failed outbound push for chore ${chore.id}:`, err)
    }
  }

  /**
   * Handles chore completion with respect to user's Google Calendar settings:
   * - Keep mode (default):
   *   - Non-recurring: patches existing GCal event to "✓ [Title]" in Graphite Gray (colorId: '8').
   *   - Recurring: leaves existing GCal event as "✓ [Title]" at completed time, spawns new event for nextDue.
   * - Remove mode:
   *   - Non-recurring: deletes existing GCal event.
   *   - Recurring: moves existing GCal event to nextDue date.
   */
  async handleCompleteChore(chore: Chore, nextDue: string | null = null, retryCount = 0): Promise<void> {
    try {
      const auth = await getValidGCalAccessToken(this.uid, retryCount > 0)
      if (!auth) return

      const integration = await getGCalIntegration(this.uid)
      const completedBehavior = integration?.completedTaskBehavior ?? 'keep'

      if (nextDue) {
        // Recurring chore
        if (completedBehavior === 'keep' && chore.gcalEventId && chore.dueAt) {
          // 1. Mark current occurrence completed on GCal (leave it in gray on today's calendar)
          const completedChoreSnapshot: Chore = {
            ...chore,
            archivedAt: new Date().toISOString(),
          }
          await pushTaskToGCal(completedChoreSnapshot, auth.calendarId, auth.accessToken)

          // 2. Spawn a new event for the next recurrence
          const nextChoreSnapshot: Chore = {
            ...chore,
            dueAt: nextDue,
            archivedAt: null,
            gcalEventId: null, // Force creation of new GCal event
            subtasks: chore.subtasks.map((s) => ({ ...s, completed: false, dueAt: null, gcalEventId: null })),
          }
          const { gcalEventId: newEventId, updated } = await pushTaskToGCal(
            nextChoreSnapshot,
            auth.calendarId,
            auth.accessToken,
          )

          // 3. Point the recurring chore in Firestore to the new nextDue GCal event
          await updateChore(
            this.uid,
            chore.id,
            {
              gcalEventId: newEventId,
              gcalLastSyncedAt: updated,
            },
            chore,
          )
        } else {
          // Remove mode (or no existing event): simply push the next occurrence with the existing event ID
          this.enqueueOutboundChore({
            ...chore,
            dueAt: nextDue,
            archivedAt: null,
            updatedAt: new Date().toISOString(),
          })
        }
      } else {
        // Non-recurring chore
        if (completedBehavior === 'keep') {
          if (chore.gcalEventId && chore.dueAt) {
            // Push completed state (✓ and gray color) to GCal
            const completedChoreSnapshot: Chore = {
              ...chore,
              archivedAt: new Date().toISOString(),
            }
            await this.pushSingleChore(completedChoreSnapshot)
          }
        } else {
          // Remove mode: delete GCal event and any subtask events on GCal
          if (chore.gcalEventId) {
            await this.handleDeleteChore(chore.gcalEventId)
          }
          if (chore.subtasks) {
            for (const s of chore.subtasks) {
              if (s.gcalEventId) {
                await this.handleDeleteChore(s.gcalEventId)
              }
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (retryCount === 0 && (msg === 'UNAUTHORIZED' || msg.includes('401'))) {
        console.warn(`401 on handleCompleteChore for ${chore.id}. Forcing token refresh and retrying once...`)
        return this.handleCompleteChore(chore, nextDue, 1)
      }
      console.warn(`Failed handleCompleteChore for ${chore.id}:`, err)
    }
  }

  /**
   * Sweeps existing completed events from Google Calendar when user switches setting to 'remove'.
   */
  async sweepCompletedEvents(completedChores: Chore[]): Promise<void> {
    const auth = await getValidGCalAccessToken(this.uid)
    if (!auth) return

    for (const chore of completedChores) {
      if (chore.gcalEventId) {
        await this.handleDeleteChore(chore.gcalEventId)
        await updateChore(
          this.uid,
          chore.id,
          {
            gcalEventId: null,
            gcalLastSyncedAt: new Date().toISOString(),
          },
          chore,
        )
      }
      if (chore.subtasks && chore.subtasks.some((s) => s.gcalEventId)) {
        const nextSubtasks = chore.subtasks.map((s) => {
          if (s.gcalEventId) {
            void this.handleDeleteChore(s.gcalEventId)
            return { ...s, gcalEventId: null }
          }
          return s
        })
        await updateChore(this.uid, chore.id, { subtasks: nextSubtasks }, chore)
      }
    }
  }

  /**
   * Handles deletion of a chore from ZeoTask to Google Calendar.
   */
  async handleDeleteChore(gcalEventId: string): Promise<void> {
    await this.recordTombstone(gcalEventId)
    try {
      const auth = await getValidGCalAccessToken(this.uid)
      if (!auth) return
      await deleteTaskFromGCal(gcalEventId, auth.calendarId, auth.accessToken)
    } catch (err) {
      console.warn(`Failed to delete GCal event ${gcalEventId}:`, err)
    }
  }

  /**
   * Public entry point to trigger a sync pass.
   * Guarantees non-overlapping, strictly serialized passes.
   */
  async triggerSync(reason: string, localChores: Chore[] = []): Promise<void> {
    if (this.isRunning) {
      this.pendingRerun = true
      this.pendingReason.add(reason)
      return
    }

    this.isRunning = true
    try {
      await this.executeFullPass(reason, localChores)
    } finally {
      this.isRunning = false
      if (this.pendingRerun) {
        this.pendingRerun = false
        const followUpReason = Array.from(this.pendingReason).join('+') || 'follow-up'
        this.pendingReason.clear()
        // Run single follow-up pass with latest data
        void this.triggerSync(followUpReason, localChores)
      }
    }
  }

  /**
   * Executes a complete two-sided sync pass:
   * 1. Flushes outbound local queue first.
   * 2. Pulls delta changes or runs full reconciliation.
   * 3. Resolves conflicts using causal timestamps & anti-echo check.
   */
  private async executeFullPass(reason: string, localChores: Chore[], retryCount = 0): Promise<void> {
    await this.loadTombstones()

    // 1. Flush local outbound mutations before reading from Google Calendar
    await this.flushOutboundQueue()

    if (localChores && localChores.length > 0) {
      this.cachedChores = localChores
    }
    const effectiveChores = this.cachedChores.length > 0 ? this.cachedChores : localChores

    const auth = await getValidGCalAccessToken(this.uid, retryCount > 0)
    if (!auth) return

    const integration = await getGCalIntegration(this.uid)
    const syncToken = integration?.syncToken ?? null

    try {
      const pullResult = await pullGCalEvents(
        auth.calendarId,
        auth.accessToken,
        syncToken,
      )

      // Handle 410 Gone / expired syncToken via Full Reconciliation
      if (pullResult.syncReset) {
        await this.executeFullReconciliation(auth.calendarId, auth.accessToken, effectiveChores)
        return
      }

      const { events, nextSyncToken } = pullResult

      // Process all returned events (changed, created, or cancelled)
      for (const event of events) {
        await this.processRemoteEvent(event, auth.calendarId, auth.accessToken, effectiveChores)
      }

      // Initial Setup & Parity: If first-time connection or manual sync, push all active tasks with due dates to GCal
      const isInitialOrManual =
        reason.includes('initial') || reason.includes('manual') || !integration?.lastSyncedAt
      if (isInitialOrManual) {
        for (const chore of effectiveChores) {
          if (!chore.archivedAt && chore.dueAt && !chore.gcalEventId) {
            await this.pushSingleChore(chore)
          }
        }
      }

      // Update syncToken bookmark and lastSyncedAt
      await saveGCalIntegration(this.uid, {
        syncToken: nextSyncToken || syncToken,
        lastSyncedAt: new Date().toISOString(),
        needsReauth: false,
        lastAuthError: null,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (retryCount === 0 && (msg === 'UNAUTHORIZED' || msg.includes('401'))) {
        console.warn(`Sync pass returned 401 UNAUTHORIZED (${reason}). Forcing token refresh and retrying once...`)
        return this.executeFullPass(reason, localChores, 1)
      }
      console.warn(`Sync pass failed (${reason}):`, err)
    }
  }

  /**
   * Processes a single event pulled from Google Calendar.
   */
  private async processRemoteEvent(
    event: GCalEvent,
    calendarId: string,
    accessToken: string,
    localChores: Chore[],
  ): Promise<void> {
    // 1. Tombstone check: if user deleted this in ZeoTask previously, do not resurrect!
    if (this.tombstones.has(event.id)) {
      if (event.status !== 'cancelled') {
        // Ensure it stays deleted in GCal
        void deleteTaskFromGCal(event.id, calendarId, accessToken)
      }
      return
    }

    // 2. Cancellation symmetry: Deleting in Google Calendar deletes in ZeoTask
    if (event.status === 'cancelled') {
      const matchingChore = localChores.find((c) => c.gcalEventId === event.id)
      if (matchingChore) {
        await this.recordTombstone(event.id)
        await deleteChore(this.uid, matchingChore.id)
        return
      }

      // Check if cancelled event belonged to a subtask
      for (const c of localChores) {
        const sIdx = c.subtasks?.findIndex((s) => s.gcalEventId === event.id)
        if (sIdx !== undefined && sIdx >= 0) {
          await this.recordTombstone(event.id)
          const nextSubtasks = [...c.subtasks]
          nextSubtasks[sIdx] = { ...nextSubtasks[sIdx], completed: true, gcalEventId: null }
          await updateChore(this.uid, c.id, { subtasks: nextSubtasks }, c)
          return
        }
      }

      // Fallback: Check if cancelled event was for an archived/completed chore in Firestore
      const zeoTaskId = event.extendedProperties?.private?.zeoTaskId
      if (zeoTaskId) {
        try {
          const snap = await getDoc(doc(getDb(), 'users', this.uid, 'chores', zeoTaskId))
          if (snap.exists()) {
            const cData = { id: snap.id, ...snap.data() } as Chore
            await this.recordTombstone(event.id)
            if (cData.archivedAt) {
              // It was already completed; just clear gcalEventId
              await updateChore(this.uid, cData.id, { gcalEventId: null }, cData)
            } else {
              await deleteChore(this.uid, cData.id)
            }
            return
          }
        } catch (e) {
          console.warn('Fallback chore cancellation check failed:', e)
        }
      }
      return
    }

    // 3. Subtask event matching
    const zeoTaskId = event.extendedProperties?.private?.zeoTaskId
    const zeoSubtaskId = event.extendedProperties?.private?.zeoSubtaskId

    if (zeoSubtaskId) {
      let parentChore = localChores.find(
        (c) =>
          (zeoTaskId && c.id === zeoTaskId) ||
          c.subtasks?.some((s) => s.id === zeoSubtaskId || s.gcalEventId === event.id),
      )

      if (!parentChore && zeoTaskId) {
        try {
          const snap = await getDoc(doc(getDb(), 'users', this.uid, 'chores', zeoTaskId))
          if (snap.exists()) {
            parentChore = { id: snap.id, ...snap.data() } as Chore
          }
        } catch (e) {
          console.warn('Fallback parent chore read failed for subtask:', e)
        }
      }

      if (parentChore && parentChore.subtasks) {
        const subIndex = parentChore.subtasks.findIndex(
          (s) => s.id === zeoSubtaskId || s.gcalEventId === event.id,
        )
        if (subIndex >= 0) {
          const s = parentChore.subtasks[subIndex]
          if (s.gcalLastSyncedAt && event.updated === s.gcalLastSyncedAt) {
            return // Echo reflection; ignore
          }

          // Causal conflict check for subtask
          const parentUpdatedMs = Date.parse(parentChore.updatedAt || '') || 0
          const eventUpdatedMs = Date.parse(event.updated || '') || 0
          if (parentUpdatedMs >= eventUpdatedMs) {
            return
          }

          const isAllDay = Boolean(event.start.date && !event.start.dateTime)
          const dueAt = event.start.date || event.start.dateTime || null
          const nextSubtasks = [...parentChore.subtasks]
          nextSubtasks[subIndex] = {
            ...s,
            dueAt,
            isAllDay,
            gcalEventId: event.id,
            gcalLastSyncedAt: event.updated || new Date().toISOString(),
          }
          await updateChore(this.uid, parentChore.id, { subtasks: nextSubtasks }, parentChore)
          return
        }
      }
      return
    }

    // 4. Parent chore active event matching
    let matchingChore = localChores.find(
      (c) => (zeoTaskId && c.id === zeoTaskId) || c.gcalEventId === event.id,
    )

    if (!matchingChore && zeoTaskId) {
      try {
        const snap = await getDoc(doc(getDb(), 'users', this.uid, 'chores', zeoTaskId))
        if (snap.exists()) {
          matchingChore = { id: snap.id, ...snap.data() } as Chore
        }
      } catch (e) {
        console.warn('Fallback chore read failed:', e)
      }
    }

    if (matchingChore) {
      // Anti-Echo Check: If event.updated matches the timestamp from our last push, it's our own echo!
      if (matchingChore.gcalLastSyncedAt && event.updated === matchingChore.gcalLastSyncedAt) {
        return // Echo reflection; ignore
      }

      // If user has local edits pending in outbound queue, local edits win
      if (this.pendingOutboundChores.has(matchingChore.id)) {
        await this.pushSingleChore(matchingChore)
        return
      }

      // Causal Conflict Resolution:
      // If local task was modified MORE RECENTLY than the Google Calendar event,
      // local task wins! Do not allow a stale or echoing GCal event to overwrite local edits.
      const choreUpdatedMs = Date.parse(matchingChore.updatedAt || '') || 0
      const eventUpdatedMs = Date.parse(event.updated || '') || 0

      if (choreUpdatedMs >= eventUpdatedMs) {
        if (choreUpdatedMs > eventUpdatedMs) {
          // Google Calendar is behind our local edit; push our local state to GCal
          await this.pushSingleChore(matchingChore)
        }
        return
      }

      // Otherwise Google Calendar edit was made AFTER our local edit! Update local chore
      const isAllDay = Boolean(event.start.date && !event.start.dateTime)
      const dueAt = event.start.date || event.start.dateTime || null
      const title = cleanGCalTitle(event.summary) || matchingChore.title
      const description =
        event.description !== undefined
          ? extractGCalDescription(event.description)
          : (matchingChore.description || '')

      await updateChore(
        this.uid,
        matchingChore.id,
        {
          title,
          description,
          dueAt,
          isAllDay,
          gcalEventId: event.id,
          gcalLastSyncedAt: event.updated || new Date().toISOString(),
        },
        matchingChore,
      )
      return
    }

    // 5. Inbound Creation: Event was created directly in Google Calendar
    // inside the dedicated "ZeoTask" calendar. Import into ZeoTask!
    if (!matchingChore && !zeoTaskId) {
      const isAllDay = Boolean(event.start.date && !event.start.dateTime)
      const dueAt = event.start.date || event.start.dateTime || null
      const title = cleanGCalTitle(event.summary) || 'New Calendar Task'
      const description = extractGCalDescription(event.description)

      const { promise } = createChore(this.uid, {
        title,
        description,
        dueAt,
        isAllDay,
        gcalEventId: event.id,
        gcalLastSyncedAt: event.updated || new Date().toISOString(),
      })
      await promise
    }
  }

  /**
   * Full Reconciliation Pass:
   * Used on initial connection or when syncToken expires (410 Gone).
   * Fetches all active events in the "ZeoTask" calendar and ensures 100% parity.
   */
  private async executeFullReconciliation(
    calendarId: string,
    accessToken: string,
    localChores: Chore[],
  ): Promise<void> {
    try {
      const activeEvents = await listAllActiveGCalEvents(calendarId, accessToken)
      const activeGCalIds = new Set(activeEvents.map((e) => e.id))
      const nowMs = Date.now()

      // 1. Detect remote deletions:
      // If a local chore has a gcalEventId that is missing from active GCal events,
      // and the chore was created more than 2 minutes ago (avoiding in-flight race conditions),
      // it was deleted in Google Calendar!
      for (const chore of localChores) {
        if (!chore.gcalEventId || chore.archivedAt) continue
        const createdMs = Date.parse(chore.createdAt) || 0
        const isFresh = nowMs - createdMs < 2 * 60 * 1000

        if (!isFresh && !activeGCalIds.has(chore.gcalEventId)) {
          await this.recordTombstone(chore.gcalEventId)
          await deleteChore(this.uid, chore.id)
        }
      }

      // 2. Process all active events
      for (const event of activeEvents) {
        await this.processRemoteEvent(event, calendarId, accessToken, localChores)
      }

      // 3. Ensure all active chores with due dates exist in Google Calendar
      for (const chore of localChores) {
        if (!chore.archivedAt && chore.dueAt && (!chore.gcalEventId || !activeGCalIds.has(chore.gcalEventId))) {
          await this.pushSingleChore(chore)
        }
      }

      await saveGCalIntegration(this.uid, {
        lastSyncedAt: new Date().toISOString(),
        needsReauth: false,
        lastAuthError: null,
      })
    } catch (err) {
      console.warn('Full reconciliation pass failed:', err)
    }
  }
}

// Singleton map per user ID
const coordinators = new Map<string, SyncCoordinator>()

export function getSyncCoordinator(uid: string): SyncCoordinator {
  let coord = coordinators.get(uid)
  if (!coord) {
    coord = new SyncCoordinator(uid)
    coordinators.set(uid, coord)
  }
  return coord
}
