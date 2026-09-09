import { logger } from 'firebase-functions'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'

const GCAL_API_BASE = 'https://www.googleapis.com/calendar/v3'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export interface GCalIntegrationData {
  enabled?: boolean
  calendarId?: string
  calendarName?: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  syncToken?: string | null
  lastSyncedAt?: string | null
  tombstones?: string[]
}

export interface ChoreData {
  id?: string
  title?: string
  description?: string
  dueAt?: string | null
  isAllDay?: boolean
  archivedAt?: string | null
  reminderEnabled?: boolean
  predueHours?: number
  nextReminderAt?: string | null
  gcalEventId?: string | null
  gcalLastSyncedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Exchanges an OAuth 2.0 authorization code for permanent refreshToken and initial accessToken.
 */
export async function exchangeOAuthCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri = 'postmessage',
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    logger.error('Failed to exchange OAuth code:', errText)
    throw new Error(`Token exchange failed: ${res.statusText}`)
  }

  const data = await res.json()
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: (data.expires_in as number) || 3600,
  }
}

/**
 * Uses a permanent refreshToken to acquire a fresh short-lived accessToken.
 */
export async function refreshGoogleToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    logger.error('Failed to refresh Google token:', errText)
    throw new Error(`Token refresh failed: ${res.statusText}`)
  }

  const data = await res.json()
  return {
    accessToken: data.access_token as string,
    expiresIn: (data.expires_in as number) || 3600,
  }
}

/**
 * Finds or creates the dedicated secondary "ZeoTask" calendar in the user's account.
 */
export async function ensureBackendZeoTaskCalendar(accessToken: string): Promise<string> {
  // 1. Check existing calendar list
  const listRes = await fetch(`${GCAL_API_BASE}/users/me/calendarList?maxResults=100`, {
    headers: authHeaders(accessToken),
  })

  if (listRes.ok) {
    const listData = await listRes.json()
    const found = (listData.items || []).find(
      (c: { summary?: string; id?: string }) =>
        c.summary?.trim().toLowerCase() === 'zeotask',
    )
    if (found?.id) return found.id
  }

  // 2. Create secondary calendar
  const createRes = await fetch(`${GCAL_API_BASE}/calendars`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      summary: 'ZeoTask',
      description: 'Tasks synced with ZeoTask',
      timeZone: 'UTC',
    }),
  })

  if (!createRes.ok) {
    const errText = await createRes.text()
    logger.error('Failed to create ZeoTask calendar:', errText)
    throw new Error(`Calendar creation failed: ${createRes.statusText}`)
  }

  const newCal = await createRes.json()
  return newCal.id
}

/**
 * Helper to get or refresh a valid access token for the user.
 * Proactively refreshes if token will expire within 15 minutes.
 */
export async function getValidBackendToken(
  db: Firestore,
  uid: string,
  integration: GCalIntegrationData,
  clientId?: string,
  clientSecret?: string,
): Promise<string | null> {
  const now = Date.now()
  const { accessToken, refreshToken, expiresAt } = integration

  // If token is valid (> 15 minutes remaining), return it directly.
  // 15-minute buffer guarantees two scheduler tick opportunities to renew before expiry.
  if (accessToken && expiresAt && expiresAt > now + 15 * 60 * 1000) {
    return accessToken
  }

  // If we have a refresh token and OAuth credentials, refresh silently in the background
  if (refreshToken && clientId && clientSecret) {
    try {
      logger.info('Proactive token auto-refresh executing for user', { uid })
      const renewed = await refreshGoogleToken(clientId, clientSecret, refreshToken)
      const newExpiresAt = now + renewed.expiresIn * 1000

      await db.doc(`users/${uid}/integrations/googleCalendar`).update({
        accessToken: renewed.accessToken,
        expiresAt: newExpiresAt,
        updatedAt: new Date().toISOString(),
      })

      return renewed.accessToken
    } catch (err) {
      logger.warn('Background token refresh failed:', err)
    }
  }

  return accessToken || null
}

/**
 * Helper to recompute nextReminderAt when dates change from Google Calendar.
 */
export function computeChoreNextReminder(
  chore: {
    dueAt?: string | null
    reminderEnabled?: boolean
    predueHours?: number
    archivedAt?: string | null
  },
  now: Date,
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

  if (predueHours > 0 && dueMs > nowMs && predueMs > nowMs) {
    return new Date(predueMs).toISOString()
  }
  if (overdueMs > nowMs) {
    return new Date(dueMs).toISOString()
  }
  return null
}

function buildBackendGCalPayload(chore: ChoreData & { id: string }) {
  const isAllDay = Boolean(chore.isAllDay)
  let start: { date?: string; dateTime?: string }
  let end: { date?: string; dateTime?: string }

  if (isAllDay && chore.dueAt) {
    const dateStr = chore.dueAt.substring(0, 10)
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    const nextDateStr = d.toISOString().substring(0, 10)
    start = { date: dateStr }
    end = { date: nextDateStr }
  } else if (chore.dueAt) {
    const dueMs = Date.parse(chore.dueAt)
    if (!Number.isNaN(dueMs)) {
      const startIso = new Date(dueMs).toISOString()
      const endIso = new Date(dueMs + 30 * 60 * 1000).toISOString()
      start = { dateTime: startIso }
      end = { dateTime: endIso }
    } else {
      const todayStr = new Date().toISOString().substring(0, 10)
      start = { date: todayStr }
      end = { date: todayStr }
    }
  } else {
    const todayStr = new Date().toISOString().substring(0, 10)
    start = { date: todayStr }
    end = { date: todayStr }
  }

  return {
    summary: chore.title || 'Untitled Task',
    description: chore.description || '',
    start,
    end,
    extendedProperties: {
      private: {
        zeoTaskId: chore.id,
        zeoTaskUpdatedAt: chore.updatedAt || '',
      },
    },
  }
}

async function pushChoreToGCalBackend(
  chore: ChoreData & { id: string },
  calendarId: string,
  accessToken: string,
): Promise<{ gcalEventId: string; updated: string } | null> {
  const payload = buildBackendGCalPayload(chore)
  if (chore.gcalEventId) {
    const patchUrl = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(chore.gcalEventId)}`
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    })
    if (patchRes.ok) {
      const data = await patchRes.json()
      return { gcalEventId: data.id, updated: data.updated }
    }
    if (patchRes.status !== 404 && patchRes.status !== 410) {
      return null
    }
  }

  // Insert new event
  const insertUrl = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`
  const insertRes = await fetch(insertUrl, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  })
  if (insertRes.ok) {
    const data = await insertRes.json()
    return { gcalEventId: data.id, updated: data.updated }
  }
  return null
}

async function deleteChoreFromGCalBackend(
  gcalEventId: string,
  calendarId: string,
  accessToken: string,
): Promise<void> {
  const url = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(gcalEventId)}`
  await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  }).catch(() => {})
}

/**
 * Executes a full background two-way sync pass between Google Calendar and Firestore:
 * 1. Proactively checks and refreshes token if needed.
 * 2. Inbound sync: Pulls changes from GCal (handles rescheduling and deletions).
 * 3. Outbound sync: Pushes any created/updated/archived local tasks to GCal.
 * 4. Updates tombstones and syncToken.
 */
export async function syncGCalForUser(
  db: Firestore,
  uid: string,
  integration: GCalIntegrationData,
  clientId?: string,
  clientSecret?: string,
): Promise<void> {
  if (!integration.enabled || !integration.calendarId) return

  const token = await getValidBackendToken(db, uid, integration, clientId, clientSecret)
  if (!token) return

  const calendarId = integration.calendarId
  const syncToken = integration.syncToken || null
  const tombstones = new Set<string>(integration.tombstones || [])
  const now = new Date()
  const nowIso = now.toISOString()

  // 1. Inbound Pull from Google Calendar
  let pullUrl = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?showDeleted=true&singleEvents=true&maxResults=250`
  if (syncToken) {
    pullUrl += `&syncToken=${encodeURIComponent(syncToken)}`
  }

  let pullRes = await fetch(pullUrl, { headers: authHeaders(token) })
  let nextSyncToken: string | null = null
  let events: any[] = []

  if (pullRes.status === 410) {
    // Sync token expired; run full reconciliation pass
    logger.info('SyncToken expired (410). Running full reconciliation pass for user', { uid })
    const fullRes = await fetch(
      `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?showDeleted=false&singleEvents=true&maxResults=1000`,
      { headers: authHeaders(token) },
    )
    if (fullRes.ok) {
      const fullData = await fullRes.json()
      events = fullData.items || []
      nextSyncToken = fullData.nextSyncToken || null
    }
  } else if (pullRes.ok) {
    const pullData = await pullRes.json()
    events = pullData.items || []
    nextSyncToken = pullData.nextSyncToken || null
  } else {
    logger.warn('Failed to pull GCal events for user', { uid, status: pullRes.status })
    return
  }

  // 2. Process Inbound Events from Google Calendar
  for (const event of events) {
    // A. Tombstone check
    if (tombstones.has(event.id)) {
      continue
    }

    // B. Event Cancelled / Deleted in Google Calendar
    if (event.status === 'cancelled') {
      const matchSnap = await db
        .collection(`users/${uid}/chores`)
        .where('gcalEventId', '==', event.id)
        .limit(1)
        .get()

      if (!matchSnap.empty) {
        const choreDoc = matchSnap.docs[0]
        logger.info('Deleting chore deleted in Google Calendar', { uid, choreId: choreDoc.id })
        tombstones.add(event.id)
        await choreDoc.ref.delete()
      }
      continue
    }

    // C. Event Modified or Created in Google Calendar
    const zeoTaskId = event.extendedProperties?.private?.zeoTaskId
    const zeoTaskUpdatedAt = event.extendedProperties?.private?.zeoTaskUpdatedAt

    let targetChoreDoc: FirebaseFirestore.DocumentSnapshot | null = null

    if (zeoTaskId) {
      const doc = await db.doc(`users/${uid}/chores/${zeoTaskId}`).get()
      if (doc.exists) targetChoreDoc = doc
    }
    if (!targetChoreDoc) {
      const matchSnap = await db
        .collection(`users/${uid}/chores`)
        .where('gcalEventId', '==', event.id)
        .limit(1)
        .get()
      if (!matchSnap.empty) targetChoreDoc = matchSnap.docs[0]
    }

    if (targetChoreDoc) {
      const chore = targetChoreDoc.data() as ChoreData

      // Anti-Echo Check: if timestamp matches, it is ZeoTask's own echo
      if (zeoTaskUpdatedAt && zeoTaskUpdatedAt === chore.updatedAt) {
        continue
      }

      const choreUpdatedMs = Date.parse(chore.updatedAt || '') || 0
      const eventUpdatedMs = Date.parse(event.updated || '') || 0

      // Only apply if Google Calendar edit was made AFTER local edit
      if (eventUpdatedMs > choreUpdatedMs) {
        const isAllDay = Boolean(event.start.date && !event.start.dateTime)
        const dueAt = event.start.date || event.start.dateTime || null
        const title = (event.summary || chore.title || 'Task').trim()

        const updatedChoreState = {
          ...chore,
          title,
          dueAt,
          isAllDay,
          gcalEventId: event.id,
          gcalLastSyncedAt: event.updated || nowIso,
          updatedAt: nowIso,
        }
        const nextReminderAt = computeChoreNextReminder(updatedChoreState, now)

        await targetChoreDoc.ref.update({
          title,
          dueAt,
          isAllDay,
          gcalEventId: event.id,
          gcalLastSyncedAt: event.updated || nowIso,
          updatedAt: FieldValue.serverTimestamp(),
          nextReminderAt,
        })
      }
    } else if (!zeoTaskId) {
      // Inbound event created directly in Google Calendar: Import into ZeoTask!
      const isAllDay = Boolean(event.start.date && !event.start.dateTime)
      const dueAt = event.start.date || event.start.dateTime || null
      const title = (event.summary || 'Calendar Task').trim()

      const newChore = {
        title,
        description: '',
        priority: 0,
        status: 'none',
        dueAt,
        isAllDay,
        isRolling: true,
        frequency: 'once',
        repeatEvery: 1,
        repeatWeekdays: [],
        labelIds: [],
        projectId: null,
        subtasks: [],
        reminderEnabled: true,
        predueHours: 24,
        nextReminderAt: null as string | null,
        lastDuePushAt: null,
        lastPreduePushAt: null,
        lastOverduePushAt: null,
        gcalEventId: event.id,
        gcalLastSyncedAt: event.updated || nowIso,
        archivedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastCompletedAt: null,
      }
      newChore.nextReminderAt = computeChoreNextReminder(newChore, now)

      await db.collection(`users/${uid}/chores`).add(newChore)
    }
  }

  // 3. Outbound Push to Google Calendar (ensures offline/closed changes sync to GCal)
  // Highly cost-optimized: Only queries chores updated since lastSyncedAt (0 reads if no local edits!)
  const choresQuery = integration.lastSyncedAt
    ? db
        .collection(`users/${uid}/chores`)
        .where('updatedAt', '>', integration.lastSyncedAt)
        .limit(50)
    : db
        .collection(`users/${uid}/chores`)
        .where('archivedAt', '==', null)
        .limit(250)

  const choresSnap = await choresQuery.get()
  for (const doc of choresSnap.docs) {
    const chore = { id: doc.id, ...(doc.data() as ChoreData) }

    // Case A: Chore archived/completed, delete from GCal
    if (chore.archivedAt && chore.gcalEventId) {
      tombstones.add(chore.gcalEventId)
      await deleteChoreFromGCalBackend(chore.gcalEventId, calendarId, token)
      await doc.ref.update({
        gcalEventId: null,
        gcalLastSyncedAt: nowIso,
      })
      continue
    }

    // Case B: Chore active with due date, check if outbound push needed
    if (!chore.archivedAt && chore.dueAt) {
      const needsPush =
        !chore.gcalEventId ||
        !chore.gcalLastSyncedAt ||
        (chore.updatedAt && chore.updatedAt > chore.gcalLastSyncedAt)

      if (needsPush) {
        const pushResult = await pushChoreToGCalBackend(chore, calendarId, token)
        if (pushResult) {
          await doc.ref.update({
            gcalEventId: pushResult.gcalEventId,
            gcalLastSyncedAt: pushResult.updated,
          })
        }
      }
    }
  }

  // 4. Save sync bookmarks and tombstones
  const tombstoneArray = Array.from(tombstones).slice(-500)
  await db.doc(`users/${uid}/integrations/googleCalendar`).update({
    syncToken: nextSyncToken || syncToken,
    tombstones: tombstoneArray,
    lastSyncedAt: nowIso,
  })
}
