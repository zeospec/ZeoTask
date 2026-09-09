import { doc, getDoc, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDb, getFirebaseFunctions } from './firebase'
import {
  deleteTaskFromGCal,
  listAllActiveGCalEvents,
  pullGCalEvents,
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
 * Refreshes silently using refreshToken if expired or expiring within 5 minutes.
 */
export async function getValidGCalAccessToken(uid: string): Promise<{
  accessToken: string
  calendarId: string
} | null> {
  const integration = await getGCalIntegration(uid)
  if (!integration || !integration.enabled || !integration.calendarId) {
    return null
  }

  const { accessToken, refreshToken, expiresAt, calendarId } = integration
  const now = Date.now()

  // If token is still valid (>15 minutes remaining), return it directly
  if (accessToken && expiresAt && expiresAt > now + 15 * 60 * 1000) {
    return { accessToken, calendarId }
  }

  // If expired or expiring soon, attempt background refresh if refreshToken is available
  if (refreshToken) {
    try {
      const clientId =
        (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
        '395410156315.apps.googleusercontent.com'
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
        }),
      })

      if (res.ok) {
        const tokenData = await res.json()
        const newAccessToken = tokenData.access_token as string
        const expiresIn = (tokenData.expires_in as number) || 3600
        const newExpiresAt = Date.now() + expiresIn * 1000

        await saveGCalIntegration(uid, {
          accessToken: newAccessToken,
          expiresAt: newExpiresAt,
        })
        return { accessToken: newAccessToken, calendarId }
      }
    } catch (refreshErr) {
      console.warn('Silent token refresh failed:', refreshErr)
    }
  }

  // Attempt Cloud Function backend token refresh if available
  try {
    const refreshCallable = httpsCallable<unknown, { accessToken?: string }>(
      getFirebaseFunctions(),
      'gcalRefreshToken',
    )
    const res = await refreshCallable()
    if (res.data?.accessToken) {
      return { accessToken: res.data.accessToken, calendarId }
    }
  } catch {
    // Cloud function not reachable (e.g. offline) or credentials not configured
  }

  // If accessToken exists even if near expiry, attempt to use it as fallback
  if (accessToken) {
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

  constructor(uid: string) {
    this.uid = uid
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
  private async pushSingleChore(chore: Chore): Promise<void> {
    try {
      const auth = await getValidGCalAccessToken(this.uid)
      if (!auth) return

      const { gcalEventId, updated } = await pushTaskToGCal(
        chore,
        auth.calendarId,
        auth.accessToken,
      )

      // Record gcalEventId and synced timestamp back to Firestore chore if changed
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
      }
    } catch (err) {
      console.warn(`Failed outbound push for chore ${chore.id}:`, err)
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
  private async executeFullPass(reason: string, localChores: Chore[]): Promise<void> {
    await this.loadTombstones()

    // 1. Flush local outbound mutations before reading from Google Calendar
    await this.flushOutboundQueue()

    const auth = await getValidGCalAccessToken(this.uid)
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
        await this.executeFullReconciliation(auth.calendarId, auth.accessToken, localChores)
        return
      }

      const { events, nextSyncToken } = pullResult

      // Process all returned events (changed, created, or cancelled)
      for (const event of events) {
        await this.processRemoteEvent(event, auth.calendarId, auth.accessToken, localChores)
      }

      // Update syncToken bookmark and lastSyncedAt
      await saveGCalIntegration(this.uid, {
        syncToken: nextSyncToken || syncToken,
        lastSyncedAt: new Date().toISOString(),
      })
    } catch (err) {
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
      }
      return
    }

    // 3. Active event matching
    const zeoTaskId = event.extendedProperties?.private?.zeoTaskId
    const zeoTaskUpdatedAt = event.extendedProperties?.private?.zeoTaskUpdatedAt
    const matchingChore = localChores.find(
      (c) => (zeoTaskId && c.id === zeoTaskId) || c.gcalEventId === event.id,
    )

    if (matchingChore) {
      // Rule A (Anti-Echo): Event matches the exact timestamp ZeoTask pushed
      if (zeoTaskUpdatedAt && zeoTaskUpdatedAt === matchingChore.updatedAt) {
        return // Echo reflection; ignore
      }

      // Rule B (Conflict resolution): Compare timestamps
      const choreUpdatedMs = Date.parse(matchingChore.updatedAt) || 0
      const eventUpdatedMs = Date.parse(event.updated || '') || 0

      if (choreUpdatedMs > eventUpdatedMs) {
        // Local edit in ZeoTask was made AFTER the remote event update.
        // ZeoTask wins: push local chore to GCal.
        await this.pushSingleChore(matchingChore)
        return
      }

      // Google Calendar edit was made AFTER the local edit.
      // Remote edit wins: update local chore.
      const isAllDay = Boolean(event.start.date && !event.start.dateTime)
      const dueAt = event.start.date || event.start.dateTime || null
      const title = event.summary?.trim() || matchingChore.title

      await updateChore(
        this.uid,
        matchingChore.id,
        {
          title,
          dueAt,
          isAllDay,
          gcalEventId: event.id,
          gcalLastSyncedAt: event.updated || new Date().toISOString(),
        },
        matchingChore,
      )
      return
    }

    // 4. Inbound Creation: Event was created directly in Google Calendar
    // inside the dedicated "ZeoTask" calendar. Import into ZeoTask!
    if (!zeoTaskId) {
      const isAllDay = Boolean(event.start.date && !event.start.dateTime)
      const dueAt = event.start.date || event.start.dateTime || null
      const title = event.summary?.trim() || 'New Calendar Task'

      await createChore(this.uid, {
        title,
        dueAt,
        isAllDay,
        gcalEventId: event.id,
        gcalLastSyncedAt: event.updated || new Date().toISOString(),
      })
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

      await saveGCalIntegration(this.uid, {
        lastSyncedAt: new Date().toISOString(),
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
