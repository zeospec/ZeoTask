"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gcalWebhook = exports.gcalRefreshToken = exports.gcalTriggerSync = exports.gcalExchangeCode = exports.reminderTick = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const gcal_1 = require("./gcal");
(0, app_1.initializeApp)();
function localParts(date, timeZone) {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
    return {
        ymd: `${parts.year}-${parts.month}-${parts.day}`,
        hour: Number(parts.hour),
        minute: Number(parts.minute),
    };
}
function computeNextReminderAt(chore, now, settings) {
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
    // 1. Pre-due reminder: fires predueHours before due, as long as due date is still ahead
    if (settings?.predueRemindersEnabled !== false &&
        !chore.lastPreduePushAt &&
        predueHours > 0 &&
        dueMs > nowMs) {
        return new Date(predueMs).toISOString();
    }
    // 2. Due reminder: fires at dueAt
    if (settings?.dueRemindersEnabled !== false &&
        !chore.lastDuePushAt &&
        overdueMs > nowMs) {
        return new Date(dueMs).toISOString();
    }
    // 3. Overdue nudge: fires 2 hours after dueAt (within a 24-hour grace window)
    if (settings?.overdueNudgeEnabled !== false &&
        !chore.lastOverduePushAt &&
        overdueMs > nowMs - 24 * 3600 * 1000) {
        return new Date(overdueMs).toISOString();
    }
    return null;
}
async function getTokensForUser(db, uid) {
    const snap = await db.collection(`users/${uid}/pushTokens`).get();
    return snap.docs
        .map((d) => ({ docId: d.id, token: d.data().token }))
        .filter((t) => Boolean(t.token));
}
async function sendToUserWithCleanup(db, uid, tokenRecords, title, body, data) {
    if (tokenRecords.length === 0)
        return;
    const tokens = tokenRecords.map((t) => t.token);
    const res = await (0, messaging_1.getMessaging)().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: { title, body, ...data },
        webpush: {
            fcmOptions: { link: data.choreId ? `/chore/${data.choreId}` : '/' },
        },
    });
    firebase_functions_1.logger.info('Notification sent', {
        uid,
        success: res.successCount,
        fail: res.failureCount,
    });
    // Cleanup dead or expired FCM tokens
    if (res.failureCount > 0) {
        const deadDocIds = [];
        res.responses.forEach((resp, idx) => {
            if (!resp.success && resp.error) {
                const code = resp.error.code;
                if (code === 'messaging/registration-token-not-registered' ||
                    code === 'messaging/invalid-registration-token') {
                    deadDocIds.push(tokenRecords[idx].docId);
                }
            }
        });
        if (deadDocIds.length > 0) {
            firebase_functions_1.logger.info('Pruning dead FCM tokens', { uid, count: deadDocIds.length });
            const batch = db.batch();
            for (const docId of deadDocIds) {
                batch.delete(db.doc(`users/${uid}/pushTokens/${docId}`));
            }
            await batch.commit().catch((err) => firebase_functions_1.logger.warn('Failed pruning tokens', err));
        }
    }
}
exports.reminderTick = (0, scheduler_1.onSchedule)({
    schedule: 'every 10 minutes',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
}, async () => {
    const db = (0, firestore_1.getFirestore)();
    const now = new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const users = await db.collection('users').get();
    for (const userDoc of users.docs) {
        const uid = userDoc.id;
        const userData = userDoc.data();
        // 0. Google Calendar Background Sync & Proactive Auto-Refresh (Runs 24/7/365 regardless of push settings)
        try {
            const gcalSnap = await db.doc(`users/${uid}/integrations/googleCalendar`).get();
            if (gcalSnap.exists) {
                const gcalData = gcalSnap.data();
                if (gcalData && gcalData.enabled) {
                    await (0, gcal_1.syncGCalForUser)(db, uid, gcalData, process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
                }
            }
        }
        catch (gcalErr) {
            firebase_functions_1.logger.warn('Error during background gcal sync in reminderTick', { uid, err: gcalErr });
        }
        const settings = (userData.notificationSettings || {});
        const timeZone = settings.timezone ||
            userData.timezone ||
            'UTC';
        // Skip if all notifications are explicitly disabled
        const allNotificationsDisabled = settings.dueRemindersEnabled === false &&
            settings.predueRemindersEnabled === false &&
            settings.overdueNudgeEnabled === false &&
            settings.morningDigestEnabled === false;
        if (allNotificationsDisabled) {
            continue;
        }
        // If user has confirmed 0 push tokens, skip
        if (userData.hasPushTokens === false) {
            continue;
        }
        // Self-healing one-time migration for existing tasks
        if (userData.remindersMigratedV2 !== true) {
            firebase_functions_1.logger.info('Running one-time remindersMigratedV2 backfill', { uid });
            const allActiveSnap = await db
                .collection(`users/${uid}/chores`)
                .where('archivedAt', '==', null)
                .get();
            if (!allActiveSnap.empty) {
                const docs = allActiveSnap.docs;
                for (let i = 0; i < docs.length; i += 400) {
                    const chunk = docs.slice(i, i + 400);
                    const batch = db.batch();
                    for (const choreSnap of chunk) {
                        const choreData = choreSnap.data();
                        const nextReminderAt = computeNextReminderAt(choreData, now, settings);
                        batch.update(choreSnap.ref, { nextReminderAt });
                    }
                    await batch.commit();
                }
            }
            await userDoc.ref.update({ remindersMigratedV2: true });
        }
        // Fetch push tokens once per user
        const tokenRecords = await getTokensForUser(db, uid);
        if (tokenRecords.length === 0) {
            if (userData.hasPushTokens !== false) {
                await userDoc.ref.update({ hasPushTokens: false }).catch(() => { });
            }
            continue;
        }
        else if (userData.hasPushTokens !== true) {
            await userDoc.ref.update({ hasPushTokens: true }).catch(() => { });
        }
        // 1. Morning Digest: Runs once per day after scheduled time within a 60-minute window
        if (settings.morningDigestEnabled !== false) {
            const hour = settings.morningDigestHour ?? 8;
            const minute = settings.morningDigestMinute ?? 0;
            const local = localParts(now, timeZone);
            const currentMinutes = local.hour * 60 + local.minute;
            const scheduledMinutes = hour * 60 + minute;
            // Matches if current time has reached or passed scheduled time (within 60 minutes)
            const inWindow = currentMinutes >= scheduledMinutes &&
                currentMinutes < scheduledMinutes + 60;
            if (inWindow && userData.lastDigestDate !== local.ymd) {
                // Read active chores ONLY when digest is actually scheduled to send
                const activeSnap = await db
                    .collection(`users/${uid}/chores`)
                    .where('archivedAt', '==', null)
                    .get();
                const open = activeSnap.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                }));
                const overdue = [];
                const dueToday = [];
                for (const chore of open) {
                    if (!chore.dueAt || chore.reminderEnabled === false)
                        continue;
                    const dueMs = Date.parse(chore.dueAt);
                    if (Number.isNaN(dueMs))
                        continue;
                    const due = new Date(dueMs);
                    const dueLocal = localParts(due, timeZone);
                    if (dueMs < nowMs)
                        overdue.push(chore);
                    else if (dueLocal.ymd === local.ymd)
                        dueToday.push(chore);
                }
                const pending = [...overdue, ...dueToday];
                if (pending.length > 0) {
                    const titles = pending
                        .slice(0, 3)
                        .map((c) => c.title || 'Task')
                        .join(', ');
                    const overdueCount = overdue.length;
                    const todayCount = pending.length - overdueCount;
                    const body = [
                        todayCount > 0 ? `${todayCount} today` : null,
                        overdueCount > 0 ? `${overdueCount} overdue` : null,
                        titles,
                    ]
                        .filter(Boolean)
                        .join(' · ');
                    await sendToUserWithCleanup(db, uid, tokenRecords, 'ZeoTask', body, { type: 'digest' });
                }
                await userDoc.ref.update({ lastDigestDate: local.ymd });
            }
        }
        // 2. Targeted Task Reminders: Query ONLY chores whose next reminder is due!
        const dueRemindersSnap = await db
            .collection(`users/${uid}/chores`)
            .where('nextReminderAt', '<=', nowIso)
            .limit(50)
            .get();
        if (dueRemindersSnap.empty) {
            continue;
        }
        for (const choreDoc of dueRemindersSnap.docs) {
            const chore = choreDoc.data();
            if (!chore.dueAt || chore.reminderEnabled === false || chore.archivedAt) {
                await choreDoc.ref.update({ nextReminderAt: null });
                continue;
            }
            const dueMs = Date.parse(chore.dueAt);
            if (Number.isNaN(dueMs)) {
                await choreDoc.ref.update({ nextReminderAt: null });
                continue;
            }
            const predueHours = chore.predueHours ?? 24;
            const predueMs = dueMs - predueHours * 3600 * 1000;
            const overdueMs = dueMs + 2 * 3600 * 1000;
            const updates = {
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            };
            // Check Pre-due
            if (settings.predueRemindersEnabled !== false &&
                !chore.lastPreduePushAt &&
                predueHours > 0 &&
                predueMs <= nowMs &&
                dueMs > nowMs) {
                await sendToUserWithCleanup(db, uid, tokenRecords, 'ZeoTask', `In ${predueHours} hours: ${chore.title || 'Task'}`, { type: 'predue', choreId: choreDoc.id });
                updates.lastPreduePushAt = nowIso;
            }
            // Check Due
            else if (settings.dueRemindersEnabled !== false &&
                !chore.lastDuePushAt &&
                dueMs <= nowMs &&
                dueMs > nowMs - 24 * 3600 * 1000) {
                await sendToUserWithCleanup(db, uid, tokenRecords, 'ZeoTask', `${chore.title || 'Task'} is due`, { type: 'due', choreId: choreDoc.id });
                updates.lastDuePushAt = nowIso;
            }
            // Check Overdue
            else if (settings.overdueNudgeEnabled !== false &&
                !chore.lastOverduePushAt &&
                overdueMs <= nowMs &&
                overdueMs > nowMs - 24 * 3600 * 1000) {
                await sendToUserWithCleanup(db, uid, tokenRecords, 'ZeoTask', `Overdue: ${chore.title || 'Task'}`, { type: 'overdue', choreId: choreDoc.id });
                updates.lastOverduePushAt = nowIso;
            }
            // Recompute next reminder with updated push timestamps and settings
            const updatedChoreState = {
                ...chore,
                lastPreduePushAt: updates.lastPreduePushAt ??
                    chore.lastPreduePushAt,
                lastDuePushAt: updates.lastDuePushAt ??
                    chore.lastDuePushAt,
                lastOverduePushAt: updates.lastOverduePushAt ??
                    chore.lastOverduePushAt,
            };
            const nextTime = computeNextReminderAt(updatedChoreState, now, settings);
            // Guard against infinite re-query loops: if nextTime <= nowMs, clear it
            updates.nextReminderAt =
                nextTime && Date.parse(nextTime) > nowMs ? nextTime : null;
            await choreDoc.ref.update(updates);
        }
    }
});
/**
 * Callable Function: Exchanges Google OAuth authorization code for permanent refresh_token
 * and sets up secondary "ZeoTask" calendar.
 */
exports.gcalExchangeCode = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const uid = request.auth.uid;
    const code = request.data?.code;
    const redirectUri = request.data?.redirectUri || 'postmessage';
    if (!code) {
        throw new https_1.HttpsError('invalid-argument', 'Missing OAuth authorization code');
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new https_1.HttpsError('failed-precondition', 'Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are not configured in Cloud Functions.');
    }
    const db = (0, firestore_1.getFirestore)();
    try {
        const { accessToken, refreshToken, expiresIn } = await (0, gcal_1.exchangeOAuthCode)(clientId, clientSecret, code, redirectUri);
        const existingSnap = await db.doc(`users/${uid}/integrations/googleCalendar`).get();
        const existingData = existingSnap.data();
        let calendarId = existingData?.calendarId;
        if (!calendarId) {
            calendarId = await (0, gcal_1.ensureBackendZeoTaskCalendar)(accessToken);
        }
        const now = Date.now();
        const docData = {
            enabled: true,
            calendarId,
            calendarName: 'ZeoTask',
            accessToken,
            refreshToken: refreshToken || existingData?.refreshToken || undefined,
            expiresAt: now + expiresIn * 1000,
            syncToken: null,
            tombstones: [],
            lastSyncedAt: null,
        };
        await db.doc(`users/${uid}/integrations/googleCalendar`).set(docData, { merge: true });
        // Trigger initial background sync
        await (0, gcal_1.syncGCalForUser)(db, uid, docData, clientId, clientSecret);
        return {
            success: true,
            calendarId,
            calendarName: 'ZeoTask',
            expiresAt: docData.expiresAt,
        };
    }
    catch (err) {
        firebase_functions_1.logger.error('Failed to exchange code:', err);
        throw new https_1.HttpsError('internal', err.message || 'Failed to exchange authorization code');
    }
});
/**
 * Callable Function: Manually or programmatically triggers a Google Calendar sync pass.
 */
exports.gcalTriggerSync = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const uid = request.auth.uid;
    const db = (0, firestore_1.getFirestore)();
    const gcalSnap = await db.doc(`users/${uid}/integrations/googleCalendar`).get();
    if (!gcalSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Integration not found');
    }
    const gcalData = gcalSnap.data();
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    await (0, gcal_1.syncGCalForUser)(db, uid, gcalData, clientId, clientSecret);
    return { success: true };
});
/**
 * Callable Function: Obtains or refreshes access token for the client.
 */
exports.gcalRefreshToken = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const uid = request.auth.uid;
    const db = (0, firestore_1.getFirestore)();
    const gcalSnap = await db.doc(`users/${uid}/integrations/googleCalendar`).get();
    if (!gcalSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Integration not found');
    }
    const gcalData = gcalSnap.data();
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const token = await (0, gcal_1.getValidBackendToken)(db, uid, gcalData, clientId, clientSecret);
    if (!token) {
        throw new https_1.HttpsError('internal', 'Could not refresh token');
    }
    return { accessToken: token };
});
/**
 * HTTP Webhook: Receives Google Calendar push notifications (watch channel updates)
 * and triggers immediate sub-second synchronization.
 */
exports.gcalWebhook = (0, https_1.onRequest)(async (req, res) => {
    const channelId = req.headers['x-goog-channel-id'];
    const resourceState = req.headers['x-goog-resource-state'];
    const channelToken = req.headers['x-goog-channel-token'];
    if (!channelId || resourceState === 'sync') {
        res.status(200).send('OK');
        return;
    }
    const uid = channelToken || req.query.uid;
    if (uid) {
        const db = (0, firestore_1.getFirestore)();
        const gcalSnap = await db.doc(`users/${uid}/integrations/googleCalendar`).get();
        if (gcalSnap.exists) {
            const gcalData = gcalSnap.data();
            if (gcalData.enabled) {
                await (0, gcal_1.syncGCalForUser)(db, uid, gcalData, process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET).catch((err) => firebase_functions_1.logger.error('Webhook sync failed for user', { uid, err }));
            }
        }
    }
    res.status(200).send('OK');
});
//# sourceMappingURL=index.js.map