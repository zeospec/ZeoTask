import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'

initializeApp()

type NotifSettings = {
  timezone?: string
  morningDigestEnabled?: boolean
  morningDigestHour?: number
  morningDigestMinute?: number
  dueRemindersEnabled?: boolean
  predueRemindersEnabled?: boolean
  overdueNudgeEnabled?: boolean
}

type ChoreDoc = {
  title?: string
  dueAt?: string | null
  archivedAt?: string | null
  reminderEnabled?: boolean
  predueHours?: number
  lastDuePushAt?: string | null
  lastPreduePushAt?: string | null
  lastOverduePushAt?: string | null
}

const SCAN_MS = 5 * 60 * 1000
const OVERDUE_NUDGE_MS = 2 * 60 * 60 * 1000

function localParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  )
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

async function tokensForUser(uid: string): Promise<string[]> {
  const snap = await getFirestore().collection(`users/${uid}/pushTokens`).get()
  return snap.docs
    .map((d) => d.data().token as string | undefined)
    .filter((t): t is string => Boolean(t))
}

async function sendToUser(
  uid: string,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  const tokens = await tokensForUser(uid)
  if (tokens.length === 0) return
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { title, body, ...data },
    webpush: {
      fcmOptions: { link: data.choreId ? `/chore/${data.choreId}` : '/' },
    },
  })
  logger.info('sent', { uid, success: res.successCount, fail: res.failureCount })
}

export const reminderTick = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
  },
  async () => {
    const db = getFirestore()
    const now = new Date()
    const nowMs = now.getTime()
    const users = await db.collection('users').get()

    for (const userDoc of users.docs) {
      const uid = userDoc.id
      const settings = (userDoc.data().notificationSettings ||
        {}) as NotifSettings
      const timeZone =
        settings.timezone ||
        (userDoc.data().timezone as string | undefined) ||
        'UTC'

      const choresSnap = await db
        .collection(`users/${uid}/chores`)
        .where('archivedAt', '==', null)
        .get()

      const open = choresSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as ChoreDoc),
      }))

      const todayYmd = localParts(now, timeZone).ymd
      const overdue: typeof open = []
      const dueToday: typeof open = []

      for (const chore of open) {
        if (!chore.dueAt || chore.reminderEnabled === false) continue
        const dueMs = Date.parse(chore.dueAt)
        if (Number.isNaN(dueMs)) continue
        const due = new Date(dueMs)
        const dueLocal = localParts(due, timeZone)

        if (dueMs < nowMs) {
          overdue.push(chore)
        }
        if (dueLocal.ymd === todayYmd && dueMs >= nowMs) {
          dueToday.push(chore)
        }

        // Due window
        if (
          settings.dueRemindersEnabled !== false &&
          dueMs <= nowMs &&
          dueMs > nowMs - SCAN_MS &&
          !chore.lastDuePushAt
        ) {
          await sendToUser(uid, 'ZeoTask', `${chore.title || 'Task'} is due`, {
            type: 'due',
            choreId: chore.id,
          })
          await db.doc(`users/${uid}/chores/${chore.id}`).update({
            lastDuePushAt: now.toISOString(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        }

        // Pre-due
        const predueHours = chore.predueHours ?? 24
        const predueAt = dueMs - predueHours * 60 * 60 * 1000
        if (
          settings.predueRemindersEnabled !== false &&
          predueAt <= nowMs &&
          predueAt > nowMs - SCAN_MS &&
          dueMs > nowMs &&
          !chore.lastPreduePushAt
        ) {
          await sendToUser(
            uid,
            'ZeoTask',
            `In ${predueHours} hours: ${chore.title || 'Task'}`,
            { type: 'predue', choreId: chore.id },
          )
          await db.doc(`users/${uid}/chores/${chore.id}`).update({
            lastPreduePushAt: now.toISOString(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        }

        // Overdue nudge (~2h after due, once)
        if (
          settings.overdueNudgeEnabled !== false &&
          dueMs + OVERDUE_NUDGE_MS <= nowMs &&
          dueMs + OVERDUE_NUDGE_MS > nowMs - SCAN_MS &&
          !chore.lastOverduePushAt
        ) {
          await sendToUser(uid, 'ZeoTask', `Overdue: ${chore.title || 'Task'}`, {
            type: 'overdue',
            choreId: chore.id,
          })
          await db.doc(`users/${uid}/chores/${chore.id}`).update({
            lastOverduePushAt: now.toISOString(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }

      // Morning digest
      if (settings.morningDigestEnabled !== false) {
        const hour = settings.morningDigestHour ?? 8
        const minute = settings.morningDigestMinute ?? 0
        const local = localParts(now, timeZone)
        const inWindow =
          local.hour === hour &&
          local.minute >= minute &&
          local.minute < minute + 5

        if (inWindow) {
          const logId = `digest:${local.ymd}`
          const logRef = db.doc(`users/${uid}/notificationLog/${logId}`)
          const already = await logRef.get()
          if (!already.exists) {
            const pending = [...overdue, ...dueToday]
            // Also include still-open tasks due earlier today
            for (const chore of open) {
              if (!chore.dueAt || chore.archivedAt) continue
              const due = new Date(chore.dueAt)
              if (localParts(due, timeZone).ymd === local.ymd) {
                if (!pending.some((p) => p.id === chore.id)) pending.push(chore)
              }
            }

            if (pending.length > 0) {
              const titles = pending
                .slice(0, 3)
                .map((c) => c.title || 'Task')
                .join(', ')
              const overdueCount = overdue.length
              const todayCount = pending.length - overdueCount
              const body = [
                todayCount > 0 ? `${todayCount} today` : null,
                overdueCount > 0 ? `${overdueCount} overdue` : null,
                titles,
              ]
                .filter(Boolean)
                .join(' · ')

              await sendToUser(uid, 'ZeoTask', body, { type: 'digest' })
              await logRef.set({
                sentAt: now.toISOString(),
                count: pending.length,
              })
            }
          }
        }
      }
    }
  },
)
