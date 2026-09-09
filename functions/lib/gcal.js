"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangeOAuthCode = exchangeOAuthCode;
exports.refreshGoogleToken = refreshGoogleToken;
exports.ensureBackendZeoTaskCalendar = ensureBackendZeoTaskCalendar;
exports.getValidBackendToken = getValidBackendToken;
exports.computeChoreNextReminder = computeChoreNextReminder;
exports.syncGCalForUser = syncGCalForUser;
const firebase_functions_1 = require("firebase-functions");
const firestore_1 = require("firebase-admin/firestore");
const GCAL_API_BASE = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
function authHeaders(accessToken) {
    return {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };
}
/**
 * Exchanges an OAuth 2.0 authorization code for permanent refreshToken and initial accessToken.
 */
async function exchangeOAuthCode(clientId, clientSecret, code, redirectUri = 'postmessage') {
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
    });
    if (!res.ok) {
        const errText = await res.text();
        firebase_functions_1.logger.error('Failed to exchange OAuth code:', errText);
        throw new Error(`Token exchange failed: ${res.statusText}`);
    }
    const data = await res.json();
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 3600,
    };
}
/**
 * Uses a permanent refreshToken to acquire a fresh short-lived accessToken.
 */
async function refreshGoogleToken(clientId, clientSecret, refreshToken) {
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
        }),
    });
    if (!res.ok) {
        const errText = await res.text();
        firebase_functions_1.logger.error('Failed to refresh Google token:', errText);
        throw new Error(`Token refresh failed: ${res.statusText}`);
    }
    const data = await res.json();
    return {
        accessToken: data.access_token,
        expiresIn: data.expires_in || 3600,
    };
}
/**
 * Finds or creates the dedicated secondary "ZeoTask" calendar in the user's account.
 */
async function ensureBackendZeoTaskCalendar(accessToken) {
    // 1. Check existing calendar list
    const listRes = await fetch(`${GCAL_API_BASE}/users/me/calendarList?maxResults=100`, {
        headers: authHeaders(accessToken),
    });
    if (listRes.ok) {
        const listData = await listRes.json();
        const found = (listData.items || []).find((c) => c.summary?.trim().toLowerCase() === 'zeotask');
        if (found?.id)
            return found.id;
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
    });
    if (!createRes.ok) {
        const errText = await createRes.text();
        firebase_functions_1.logger.error('Failed to create ZeoTask calendar:', errText);
        throw new Error(`Calendar creation failed: ${createRes.statusText}`);
    }
    const newCal = await createRes.json();
    return newCal.id;
}
/**
 * Helper to get or refresh a valid access token for the user.
 * Proactively refreshes if token will expire within 15 minutes.
 */
async function getValidBackendToken(db, uid, integration, clientId, clientSecret) {
    const now = Date.now();
    const { accessToken, refreshToken, expiresAt } = integration;
    // If token is valid (> 15 minutes remaining), return it directly.
    // 15-minute buffer guarantees two scheduler tick opportunities to renew before expiry.
    if (accessToken && expiresAt && expiresAt > now + 15 * 60 * 1000) {
        return accessToken;
    }
    // If we have a refresh token and OAuth credentials, refresh silently in the background
    if (refreshToken && clientId && clientSecret) {
        try {
            firebase_functions_1.logger.info('Proactive token auto-refresh executing for user', { uid });
            const renewed = await refreshGoogleToken(clientId, clientSecret, refreshToken);
            const newExpiresAt = now + renewed.expiresIn * 1000;
            await db.doc(`users/${uid}/integrations/googleCalendar`).update({
                accessToken: renewed.accessToken,
                expiresAt: newExpiresAt,
                updatedAt: new Date().toISOString(),
            });
            return renewed.accessToken;
        }
        catch (err) {
            firebase_functions_1.logger.warn('Background token refresh failed:', err);
        }
    }
    return accessToken || null;
}
/**
 * Helper to recompute nextReminderAt when dates change from Google Calendar.
 */
function computeChoreNextReminder(chore, now) {
    if (chore.archivedAt || chore.reminderEnabled === false || !chore.dueAt) {
        return null;
    }
    const dueMs = Date.parse(chore.dueAt);
    if (Number.isNaN(dueMs))
        return null;
    const nowMs = now.getTime();
    const predueHours = chore.predueHours ?? 24;
    const predueMs = dueMs - predueHours * 3600 * 1000;
    const overdueMs = dueMs + 2 * 3600 * 1000;
    if (predueHours > 0 && dueMs > nowMs && predueMs > nowMs) {
        return new Date(predueMs).toISOString();
    }
    if (overdueMs > nowMs) {
        return new Date(dueMs).toISOString();
    }
    return null;
}
function stripHtml(html) {
    return html.replace(/<[^>]*>?/gm, '').trim();
}
function buildBackendGCalPayload(chore) {
    const isAllDay = Boolean(chore.isAllDay);
    let start;
    let end;
    if (isAllDay && chore.dueAt) {
        const dateStr = chore.dueAt.substring(0, 10);
        const d = new Date(dateStr + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        const nextDateStr = d.toISOString().substring(0, 10);
        start = { date: dateStr };
        end = { date: nextDateStr };
    }
    else if (chore.dueAt) {
        const dueMs = Date.parse(chore.dueAt);
        if (!Number.isNaN(dueMs)) {
            const startIso = new Date(dueMs).toISOString();
            const endIso = new Date(dueMs + 30 * 60 * 1000).toISOString();
            start = { dateTime: startIso };
            end = { dateTime: endIso };
        }
        else {
            const todayStr = new Date().toISOString().substring(0, 10);
            start = { date: todayStr };
            end = { date: todayStr };
        }
    }
    else {
        const todayStr = new Date().toISOString().substring(0, 10);
        start = { date: todayStr };
        end = { date: todayStr };
    }
    let plainDesc = chore.description ? stripHtml(chore.description) : '';
    if (chore.subtasks && chore.subtasks.length > 0) {
        const checklistText = chore.subtasks
            .map((s) => `[${s.completed ? '✓' : ' '}] ${s.title}`)
            .join('\n');
        plainDesc = plainDesc
            ? `${plainDesc}\n\nChecklist:\n${checklistText}`
            : `Checklist:\n${checklistText}`;
    }
    return {
        summary: chore.title || 'Untitled Task',
        description: plainDesc,
        start,
        end,
        extendedProperties: {
            private: {
                zeoTaskId: chore.id,
                zeoTaskUpdatedAt: chore.updatedAt || '',
            },
        },
    };
}
function buildBackendGCalSubtaskPayload(subtask, parentChore) {
    const isAllDay = Boolean(subtask.isAllDay);
    let start;
    let end;
    if (isAllDay && subtask.dueAt) {
        const dateStr = subtask.dueAt.substring(0, 10);
        const d = new Date(dateStr + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        const nextDateStr = d.toISOString().substring(0, 10);
        start = { date: dateStr };
        end = { date: nextDateStr };
    }
    else if (subtask.dueAt) {
        const dueMs = Date.parse(subtask.dueAt);
        if (!Number.isNaN(dueMs)) {
            start = { dateTime: new Date(dueMs).toISOString() };
            end = { dateTime: new Date(dueMs + 30 * 60 * 1000).toISOString() };
        }
        else {
            const todayStr = new Date().toISOString().substring(0, 10);
            start = { date: todayStr };
            end = { date: todayStr };
        }
    }
    else {
        const todayStr = new Date().toISOString().substring(0, 10);
        start = { date: todayStr };
        end = { date: todayStr };
    }
    return {
        summary: `↳ ${subtask.title || 'Checklist item'} (${parentChore.title || 'Task'})`,
        description: `Checklist item for: ${parentChore.title || 'Task'}`,
        start,
        end,
        extendedProperties: {
            private: {
                zeoTaskId: parentChore.id,
                zeoSubtaskId: subtask.id,
                zeoTaskUpdatedAt: parentChore.updatedAt || '',
            },
        },
    };
}
async function pushSubtaskToGCalBackend(subtask, parentChore, calendarId, accessToken) {
    const payload = buildBackendGCalSubtaskPayload(subtask, parentChore);
    if (subtask.gcalEventId) {
        const patchUrl = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(subtask.gcalEventId)}`;
        const patchRes = await fetch(patchUrl, {
            method: 'PATCH',
            headers: authHeaders(accessToken),
            body: JSON.stringify(payload),
        });
        if (patchRes.ok) {
            const data = await patchRes.json();
            return { gcalEventId: data.id, updated: data.updated };
        }
        if (patchRes.status !== 404 && patchRes.status !== 410) {
            return null;
        }
    }
    // Insert new event
    const insertUrl = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
    const insertRes = await fetch(insertUrl, {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify(payload),
    });
    if (insertRes.ok) {
        const data = await insertRes.json();
        return { gcalEventId: data.id, updated: data.updated };
    }
    return null;
}
async function pushChoreToGCalBackend(chore, calendarId, accessToken) {
    const payload = buildBackendGCalPayload(chore);
    if (chore.gcalEventId) {
        const patchUrl = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(chore.gcalEventId)}`;
        const patchRes = await fetch(patchUrl, {
            method: 'PATCH',
            headers: authHeaders(accessToken),
            body: JSON.stringify(payload),
        });
        if (patchRes.ok) {
            const data = await patchRes.json();
            return { gcalEventId: data.id, updated: data.updated };
        }
        if (patchRes.status !== 404 && patchRes.status !== 410) {
            return null;
        }
    }
    // Insert new event
    const insertUrl = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
    const insertRes = await fetch(insertUrl, {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify(payload),
    });
    if (insertRes.ok) {
        const data = await insertRes.json();
        return { gcalEventId: data.id, updated: data.updated };
    }
    return null;
}
async function deleteChoreFromGCalBackend(gcalEventId, calendarId, accessToken) {
    const url = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(gcalEventId)}`;
    await fetch(url, {
        method: 'DELETE',
        headers: authHeaders(accessToken),
    }).catch(() => { });
}
/**
 * Executes a full background two-way sync pass between Google Calendar and Firestore:
 * 1. Proactively checks and refreshes token if needed.
 * 2. Inbound sync: Pulls changes from GCal (handles rescheduling and deletions).
 * 3. Outbound sync: Pushes any created/updated/archived local tasks to GCal.
 * 4. Updates tombstones and syncToken.
 */
async function syncGCalForUser(db, uid, integration, clientId, clientSecret) {
    if (!integration.enabled || !integration.calendarId)
        return;
    const token = await getValidBackendToken(db, uid, integration, clientId, clientSecret);
    if (!token)
        return;
    const calendarId = integration.calendarId;
    const syncToken = integration.syncToken || null;
    const tombstones = new Set(integration.tombstones || []);
    const now = new Date();
    const nowIso = now.toISOString();
    // 1. Inbound Pull from Google Calendar
    let pullUrl = `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?showDeleted=true&singleEvents=true&maxResults=250`;
    if (syncToken) {
        pullUrl += `&syncToken=${encodeURIComponent(syncToken)}`;
    }
    let pullRes = await fetch(pullUrl, { headers: authHeaders(token) });
    let nextSyncToken = null;
    let events = [];
    if (pullRes.status === 410) {
        // Sync token expired; run full reconciliation pass
        firebase_functions_1.logger.info('SyncToken expired (410). Running full reconciliation pass for user', { uid });
        const fullRes = await fetch(`${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?showDeleted=false&singleEvents=true&maxResults=1000`, { headers: authHeaders(token) });
        if (fullRes.ok) {
            const fullData = await fullRes.json();
            events = fullData.items || [];
            nextSyncToken = fullData.nextSyncToken || null;
        }
    }
    else if (pullRes.ok) {
        const pullData = await pullRes.json();
        events = pullData.items || [];
        nextSyncToken = pullData.nextSyncToken || null;
    }
    else {
        firebase_functions_1.logger.warn('Failed to pull GCal events for user', { uid, status: pullRes.status });
        return;
    }
    // 2. Process Inbound Events from Google Calendar
    for (const event of events) {
        // A. Tombstone check
        if (tombstones.has(event.id)) {
            continue;
        }
        // B. Event Cancelled / Deleted in Google Calendar
        if (event.status === 'cancelled') {
            const matchSnap = await db
                .collection(`users/${uid}/chores`)
                .where('gcalEventId', '==', event.id)
                .limit(1)
                .get();
            if (!matchSnap.empty) {
                const choreDoc = matchSnap.docs[0];
                firebase_functions_1.logger.info('Deleting chore deleted in Google Calendar', { uid, choreId: choreDoc.id });
                tombstones.add(event.id);
                await choreDoc.ref.delete();
                continue;
            }
            // Check if cancelled event was a subtask
            const zeoTaskId = event.extendedProperties?.private?.zeoTaskId;
            const zeoSubtaskId = event.extendedProperties?.private?.zeoSubtaskId;
            if (zeoTaskId) {
                const parentDoc = await db.doc(`users/${uid}/chores/${zeoTaskId}`).get();
                if (parentDoc.exists) {
                    const pData = parentDoc.data();
                    const sIdx = pData.subtasks?.findIndex((s) => (zeoSubtaskId && s.id === zeoSubtaskId) || s.gcalEventId === event.id);
                    if (sIdx !== undefined && sIdx >= 0 && pData.subtasks) {
                        tombstones.add(event.id);
                        const nextSubtasks = [...pData.subtasks];
                        nextSubtasks[sIdx] = { ...nextSubtasks[sIdx], completed: true, gcalEventId: null };
                        await parentDoc.ref.update({
                            subtasks: nextSubtasks,
                            updatedAt: firestore_1.FieldValue.serverTimestamp(),
                        });
                    }
                }
            }
            continue;
        }
        // C. Event Modified or Created in Google Calendar
        const zeoTaskId = event.extendedProperties?.private?.zeoTaskId;
        const zeoSubtaskId = event.extendedProperties?.private?.zeoSubtaskId;
        const zeoTaskUpdatedAt = event.extendedProperties?.private?.zeoTaskUpdatedAt;
        // Handle subtask event modified in Google Calendar
        if (zeoSubtaskId && zeoTaskId) {
            const parentDoc = await db.doc(`users/${uid}/chores/${zeoTaskId}`).get();
            if (parentDoc.exists) {
                const pData = parentDoc.data();
                const sIdx = pData.subtasks?.findIndex((s) => s.id === zeoSubtaskId || s.gcalEventId === event.id);
                if (sIdx !== undefined && sIdx >= 0 && pData.subtasks) {
                    const s = pData.subtasks[sIdx];
                    // Anti-Echo check
                    if (zeoTaskUpdatedAt && zeoTaskUpdatedAt === pData.updatedAt) {
                        continue;
                    }
                    const isAllDay = Boolean(event.start.date && !event.start.dateTime);
                    const dueAt = event.start.date || event.start.dateTime || null;
                    const nextSubtasks = [...pData.subtasks];
                    nextSubtasks[sIdx] = {
                        ...s,
                        dueAt,
                        isAllDay,
                        gcalEventId: event.id,
                        gcalLastSyncedAt: event.updated || nowIso,
                    };
                    await parentDoc.ref.update({
                        subtasks: nextSubtasks,
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    });
                    continue;
                }
            }
        }
        let targetChoreDoc = null;
        if (zeoTaskId) {
            const doc = await db.doc(`users/${uid}/chores/${zeoTaskId}`).get();
            if (doc.exists)
                targetChoreDoc = doc;
        }
        if (!targetChoreDoc) {
            const matchSnap = await db
                .collection(`users/${uid}/chores`)
                .where('gcalEventId', '==', event.id)
                .limit(1)
                .get();
            if (!matchSnap.empty)
                targetChoreDoc = matchSnap.docs[0];
        }
        if (targetChoreDoc) {
            const chore = targetChoreDoc.data();
            // Anti-Echo Check: if timestamp matches, it is ZeoTask's own echo
            if (zeoTaskUpdatedAt && zeoTaskUpdatedAt === chore.updatedAt) {
                continue;
            }
            const choreUpdatedMs = Date.parse(chore.updatedAt || '') || 0;
            const eventUpdatedMs = Date.parse(event.updated || '') || 0;
            // Only apply if Google Calendar edit was made AFTER local edit
            if (eventUpdatedMs > choreUpdatedMs) {
                const isAllDay = Boolean(event.start.date && !event.start.dateTime);
                const dueAt = event.start.date || event.start.dateTime || null;
                const title = (event.summary || chore.title || 'Task').trim();
                const updatedChoreState = {
                    ...chore,
                    title,
                    dueAt,
                    isAllDay,
                    gcalEventId: event.id,
                    gcalLastSyncedAt: event.updated || nowIso,
                    updatedAt: nowIso,
                };
                const nextReminderAt = computeChoreNextReminder(updatedChoreState, now);
                await targetChoreDoc.ref.update({
                    title,
                    dueAt,
                    isAllDay,
                    gcalEventId: event.id,
                    gcalLastSyncedAt: event.updated || nowIso,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    nextReminderAt,
                });
            }
        }
        else if (!zeoTaskId) {
            // Inbound event created directly in Google Calendar: Import into ZeoTask!
            const isAllDay = Boolean(event.start.date && !event.start.dateTime);
            const dueAt = event.start.date || event.start.dateTime || null;
            const title = (event.summary || 'Calendar Task').trim();
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
                nextReminderAt: null,
                lastDuePushAt: null,
                lastPreduePushAt: null,
                lastOverduePushAt: null,
                gcalEventId: event.id,
                gcalLastSyncedAt: event.updated || nowIso,
                archivedAt: null,
                createdAt: nowIso,
                updatedAt: nowIso,
                lastCompletedAt: null,
            };
            newChore.nextReminderAt = computeChoreNextReminder(newChore, now);
            await db.collection(`users/${uid}/chores`).add(newChore);
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
            .limit(250);
    const choresSnap = await choresQuery.get();
    for (const doc of choresSnap.docs) {
        const chore = { id: doc.id, ...doc.data() };
        // Case A: Chore archived/completed OR due date removed, delete from GCal
        if ((chore.archivedAt || !chore.dueAt) && chore.gcalEventId) {
            tombstones.add(chore.gcalEventId);
            await deleteChoreFromGCalBackend(chore.gcalEventId, calendarId, token);
            await doc.ref.update({
                gcalEventId: null,
                gcalLastSyncedAt: nowIso,
            });
            chore.gcalEventId = null;
        }
        else if (!chore.archivedAt && chore.dueAt) {
            // Case B: Chore active with due date, check if outbound push needed
            const needsPush = !chore.gcalEventId ||
                !chore.gcalLastSyncedAt ||
                (chore.updatedAt && chore.updatedAt > chore.gcalLastSyncedAt);
            if (needsPush) {
                const pushResult = await pushChoreToGCalBackend(chore, calendarId, token);
                if (pushResult) {
                    await doc.ref.update({
                        gcalEventId: pushResult.gcalEventId,
                        gcalLastSyncedAt: pushResult.updated,
                    });
                    chore.gcalEventId = pushResult.gcalEventId;
                    chore.gcalLastSyncedAt = pushResult.updated;
                }
            }
        }
        // Subtasks with deadlines push/cleanup
        if (chore.subtasks && chore.subtasks.length > 0) {
            let subtasksModified = false;
            const nextSubtasks = [...chore.subtasks];
            for (let i = 0; i < nextSubtasks.length; i++) {
                const s = nextSubtasks[i];
                if (s.dueAt && !s.completed && !chore.archivedAt) {
                    const needsSubPush = !s.gcalEventId ||
                        !s.gcalLastSyncedAt ||
                        (chore.updatedAt && chore.updatedAt > s.gcalLastSyncedAt);
                    if (needsSubPush) {
                        const pushResult = await pushSubtaskToGCalBackend(s, chore, calendarId, token);
                        if (pushResult &&
                            (s.gcalEventId !== pushResult.gcalEventId || s.gcalLastSyncedAt !== pushResult.updated)) {
                            nextSubtasks[i] = {
                                ...s,
                                gcalEventId: pushResult.gcalEventId,
                                gcalLastSyncedAt: pushResult.updated,
                            };
                            subtasksModified = true;
                        }
                    }
                }
                else if (s.gcalEventId && (s.completed || !s.dueAt || chore.archivedAt)) {
                    tombstones.add(s.gcalEventId);
                    await deleteChoreFromGCalBackend(s.gcalEventId, calendarId, token);
                    nextSubtasks[i] = {
                        ...s,
                        gcalEventId: null,
                        gcalLastSyncedAt: nowIso,
                    };
                    subtasksModified = true;
                }
            }
            if (subtasksModified) {
                await doc.ref.update({ subtasks: nextSubtasks });
            }
        }
    }
    // 4. Save sync bookmarks and tombstones
    const tombstoneArray = Array.from(tombstones).slice(-500);
    await db.doc(`users/${uid}/integrations/googleCalendar`).update({
        syncToken: nextSyncToken || syncToken,
        tombstones: tombstoneArray,
        lastSyncedAt: nowIso,
    });
}
//# sourceMappingURL=gcal.js.map