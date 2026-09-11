import { addDays, format } from 'date-fns'
import type { Chore, Subtask } from '../types/models'
import { parseChoreDue, isChoreAllDay } from './scheduler'

const GCAL_API_BASE = 'https://www.googleapis.com/calendar/v3'

export interface GCalEventDate {
  date?: string // YYYY-MM-DD
  dateTime?: string // ISO-8601 string
  timeZone?: string
}

export interface GCalEvent {
  id: string
  summary?: string
  description?: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  start: GCalEventDate
  end: GCalEventDate
  updated?: string
  extendedProperties?: {
    private?: {
      zeoTaskId?: string
      zeoSubtaskId?: string
      zeoTaskUpdatedAt?: string
      clientInstanceId?: string
    }
  }
}

export interface GCalPullResult {
  events: GCalEvent[]
  nextSyncToken: string | null
  syncReset?: boolean
}

/** Ensure authorization header with Bearer token. */
function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/** Strips simple HTML tags for plain text calendar descriptions. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>?/gm, '').trim()
}

/**
 * Searches the user's calendars for one named "ZeoTask".
 * Returns calendarId if found, or null otherwise.
 */
export async function findZeoTaskCalendar(accessToken: string): Promise<string | null> {
  const res = await fetch(`${GCAL_API_BASE}/users/me/calendarList?maxResults=100`, {
    headers: authHeaders(accessToken),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('UNAUTHORIZED')
    throw new Error(`Failed to list calendars: ${res.statusText}`)
  }
  const data = await res.json()
  const found = (data.items || []).find(
    (c: { summary?: string; id?: string }) => c.summary?.trim().toLowerCase() === 'zeotask',
  )
  return found?.id || null
}

/**
 * Creates a dedicated secondary calendar named "ZeoTask".
 */
export async function createZeoTaskCalendar(accessToken: string): Promise<string> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const res = await fetch(`${GCAL_API_BASE}/calendars`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      summary: 'ZeoTask',
      description: 'Tasks synced with ZeoTask',
      timeZone,
    }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('UNAUTHORIZED')
    throw new Error(`Failed to create ZeoTask calendar: ${res.statusText}`)
  }
  const data = await res.json()
  return data.id
}

/**
 * Locates an existing "ZeoTask" calendar or creates a new one.
 */
export async function ensureZeoTaskCalendar(accessToken: string): Promise<string> {
  const existing = await findZeoTaskCalendar(accessToken)
  if (existing) return existing
  return await createZeoTaskCalendar(accessToken)
}

/**
 * Cleans leading completion checkmarks from Google Calendar event summaries.
 * Prevents titles from accumulating stacked checkmarks (e.g. '✓ ✓ Title').
 */
export function cleanGCalTitle(summary?: string | null): string {
  if (!summary) return 'Untitled Task'
  return summary.replace(/^[✓✔]\s*/, '').trim() || 'Untitled Task'
}

/**
 * Extracts notes/description from Google Calendar event description,
 * cleanly separating user notes from the auto-generated checklist footer.
 */
export function extractGCalDescription(eventDesc?: string | null): string {
  if (!eventDesc) return ''
  const checklistIdx = eventDesc.indexOf('\n\nChecklist:\n')
  if (checklistIdx !== -1) {
    return eventDesc.substring(0, checklistIdx).trim()
  }
  const altChecklistIdx = eventDesc.indexOf('Checklist:\n')
  if (altChecklistIdx === 0) {
    return ''
  }
  if (altChecklistIdx !== -1) {
    return eventDesc.substring(0, altChecklistIdx).trim()
  }
  return eventDesc.trim()
}

/**
 * Builds Google Calendar event payload from a ZeoTask Chore.
 */
function buildGCalEventPayload(chore: Chore) {
  const isAllDay = isChoreAllDay(chore)
  const due = parseChoreDue(chore.dueAt)

  let start: GCalEventDate
  let end: GCalEventDate

  if (isAllDay && due) {
    const startDateStr = format(due, 'yyyy-MM-dd')
    // Google all-day events have an exclusive end date (next day)
    const endDateStr = format(addDays(due, 1), 'yyyy-MM-dd')
    start = { date: startDateStr }
    end = { date: endDateStr }
  } else if (due) {
    const startIso = due.toISOString()
    // Default 30-minute slot
    const endIso = new Date(due.getTime() + 30 * 60 * 1000).toISOString()
    start = { dateTime: startIso }
    end = { dateTime: endIso }
  } else {
    // If no due date, default to today all-day
    const today = new Date()
    const startDateStr = format(today, 'yyyy-MM-dd')
    const endDateStr = format(addDays(today, 1), 'yyyy-MM-dd')
    start = { date: startDateStr }
    end = { date: endDateStr }
  }

  let plainDesc = chore.description ? stripHtml(chore.description) : ''
  if (chore.subtasks && chore.subtasks.length > 0) {
    const checklistText = chore.subtasks
      .map((s) => `[${s.completed ? '✓' : ' '}] ${s.title}`)
      .join('\n')
    plainDesc = plainDesc
      ? `${plainDesc}\n\nChecklist:\n${checklistText}`
      : `Checklist:\n${checklistText}`
  }

  const isArchived = Boolean(chore.archivedAt)
  const baseTitle = cleanGCalTitle(chore.title)
  const summary = isArchived ? `✓ ${baseTitle}` : baseTitle

  const payload: Record<string, unknown> = {
    summary,
    description: plainDesc,
    start,
    end,
    extendedProperties: {
      private: {
        zeoTaskId: chore.id,
        zeoTaskUpdatedAt: chore.updatedAt,
      },
    },
  }

  // colorId '8' = Graphite/Gray for completed tasks.
  // MUST be omitted (not set to '') for non-archived events — the API rejects colorId: '' with 400.
  if (isArchived) {
    payload.colorId = '8'
  }

  return payload
}

/**
 * Pushes a chore to Google Calendar (create or update).
 * Embeds zeoTaskUpdatedAt in private extendedProperties to prevent echo loops.
 */
export async function pushTaskToGCal(
  chore: Chore,
  calendarId: string,
  accessToken: string,
): Promise<{ gcalEventId: string; updated: string }> {
  const payload = buildGCalEventPayload(chore)

  if (chore.gcalEventId) {
    // Attempt PATCH first
    const url = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(chore.gcalEventId)}`
    const patchRes = await fetch(url, {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    })

    if (patchRes.ok) {
      const data = await patchRes.json()
      return { gcalEventId: data.id, updated: data.updated }
    }

    // If event was cancelled or 404 in GCal, recreate via POST
    if (patchRes.status === 404 || patchRes.status === 410) {
      // Fall through to insert
    } else if (patchRes.status === 401) {
      throw new Error('UNAUTHORIZED')
    } else {
      throw new Error(`Failed to update GCal event: ${patchRes.statusText}`)
    }
  }

  // Insert new event
  const insertUrl = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`
  const insertRes = await fetch(insertUrl, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  })

  if (!insertRes.ok) {
    if (insertRes.status === 401) throw new Error('UNAUTHORIZED')
    throw new Error(`Failed to insert GCal event: ${insertRes.statusText}`)
  }

  const data = await insertRes.json()
  return { gcalEventId: data.id, updated: data.updated }
}

/**
 * Builds Google Calendar event payload for a Subtask with a deadline.
 */
function buildGCalSubtaskPayload(subtask: Subtask, parentChore: Chore) {
  const isAllDay = isChoreAllDay(subtask)
  const due = parseChoreDue(subtask.dueAt)

  let start: GCalEventDate
  let end: GCalEventDate

  if (isAllDay && due) {
    const startDateStr = format(due, 'yyyy-MM-dd')
    const endDateStr = format(addDays(due, 1), 'yyyy-MM-dd')
    start = { date: startDateStr }
    end = { date: endDateStr }
  } else if (due) {
    const startIso = due.toISOString()
    const endIso = new Date(due.getTime() + 30 * 60 * 1000).toISOString()
    start = { dateTime: startIso }
    end = { dateTime: endIso }
  } else {
    const today = new Date()
    const startDateStr = format(today, 'yyyy-MM-dd')
    const endDateStr = format(addDays(today, 1), 'yyyy-MM-dd')
    start = { date: startDateStr }
    end = { date: endDateStr }
  }

  const isCompleted = Boolean(subtask.completed || parentChore.archivedAt)
  const subTitle = cleanGCalTitle(subtask.title || 'Checklist item')
  const parTitle = cleanGCalTitle(parentChore.title || 'Task')
  const summary = isCompleted
    ? `↳ ✓ ${subTitle} (${parTitle})`
    : `↳ ${subTitle} (${parTitle})`

  const payload: Record<string, unknown> = {
    summary,
    description: `Checklist item for: ${parentChore.title}`,
    start,
    end,
    extendedProperties: {
      private: {
        zeoTaskId: parentChore.id,
        zeoSubtaskId: subtask.id,
        zeoTaskUpdatedAt: parentChore.updatedAt,
      },
    },
  }

  // colorId '8' = Graphite/Gray for completed subtasks.
  // Omit the field entirely when not completed — API rejects colorId: '' with 400 on insert.
  if (isCompleted) {
    payload.colorId = '8'
  }

  return payload
}

/**
 * Pushes a subtask to Google Calendar (create or update).
 */
export async function pushSubtaskToGCal(
  subtask: Subtask,
  parentChore: Chore,
  calendarId: string,
  accessToken: string,
): Promise<{ gcalEventId: string; updated: string }> {
  const payload = buildGCalSubtaskPayload(subtask, parentChore)

  if (subtask.gcalEventId) {
    const url = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(subtask.gcalEventId)}`
    const patchRes = await fetch(url, {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    })

    if (patchRes.ok) {
      const data = await patchRes.json()
      return { gcalEventId: data.id, updated: data.updated }
    }
    if (patchRes.status === 401) throw new Error('UNAUTHORIZED')
  }

  // Insert new event
  const insertUrl = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`
  const insertRes = await fetch(insertUrl, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  })

  if (!insertRes.ok) {
    if (insertRes.status === 401) throw new Error('UNAUTHORIZED')
    throw new Error(`Failed to insert GCal subtask event: ${insertRes.statusText}`)
  }

  const data = await insertRes.json()
  return { gcalEventId: data.id, updated: data.updated }
}

/**
 * Deletes an event from Google Calendar.
 * Safely ignores 404 and 410 (already deleted).
 */
export async function deleteTaskFromGCal(
  gcalEventId: string,
  calendarId: string,
  accessToken: string,
): Promise<void> {
  const url = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(gcalEventId)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  })

  if (!res.ok && res.status !== 404 && res.status !== 410) {
    if (res.status === 401) throw new Error('UNAUTHORIZED')
    throw new Error(`Failed to delete GCal event: ${res.statusText}`)
  }
}

/**
 * Pulls incremental changes from Google Calendar using syncToken.
 * Detects 410 Gone (expired sync token) and flags syncReset: true.
 */
export async function pullGCalEvents(
  calendarId: string,
  accessToken: string,
  syncToken?: string | null,
): Promise<GCalPullResult> {
  let url = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?showDeleted=true&singleEvents=true&maxResults=250`
  if (syncToken) {
    url += `&syncToken=${encodeURIComponent(syncToken)}`
  }

  const res = await fetch(url, {
    headers: authHeaders(accessToken),
  })

  if (res.status === 410) {
    // Sync token expired or invalidated; caller must run full reconciliation
    return { events: [], nextSyncToken: null, syncReset: true }
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error('UNAUTHORIZED')
    throw new Error(`Failed to pull GCal events: ${res.statusText}`)
  }

  const data = await res.json()
  return {
    events: data.items || [],
    nextSyncToken: data.nextSyncToken || null,
  }
}

/**
 * Fetches all currently active (non-cancelled) events for full reconciliation.
 */
export async function listAllActiveGCalEvents(
  calendarId: string,
  accessToken: string,
): Promise<GCalEvent[]> {
  const url = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?showDeleted=false&singleEvents=true&maxResults=2500`
  const res = await fetch(url, {
    headers: authHeaders(accessToken),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('UNAUTHORIZED')
    throw new Error(`Failed to list active GCal events: ${res.statusText}`)
  }
  const data = await res.json()
  return data.items || []
}
