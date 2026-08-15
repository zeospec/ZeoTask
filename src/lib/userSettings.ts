import type { NotificationSettings } from '../types/models'

export function defaultNotificationSettings(
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): NotificationSettings {
  return {
    timezone,
    morningDigestEnabled: true,
    morningDigestHour: 8,
    morningDigestMinute: 0,
    dueRemindersEnabled: true,
    predueRemindersEnabled: true,
    overdueNudgeEnabled: true,
  }
}

export function normalizeNotificationSettings(
  raw: Partial<NotificationSettings> | null | undefined,
  timezoneFallback?: string,
): NotificationSettings {
  const base = defaultNotificationSettings(timezoneFallback)
  if (!raw) return base
  return {
    timezone: raw.timezone || base.timezone,
    morningDigestEnabled: raw.morningDigestEnabled ?? base.morningDigestEnabled,
    morningDigestHour: clampHour(raw.morningDigestHour ?? base.morningDigestHour),
    morningDigestMinute: clampMinute(
      raw.morningDigestMinute ?? base.morningDigestMinute,
    ),
    dueRemindersEnabled: raw.dueRemindersEnabled ?? base.dueRemindersEnabled,
    predueRemindersEnabled:
      raw.predueRemindersEnabled ?? base.predueRemindersEnabled,
    overdueNudgeEnabled: raw.overdueNudgeEnabled ?? base.overdueNudgeEnabled,
  }
}

function clampHour(n: number) {
  if (!Number.isFinite(n)) return 8
  return Math.min(23, Math.max(0, Math.round(n)))
}

function clampMinute(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.min(59, Math.max(0, Math.round(n)))
}

export function formatDigestTime(settings: NotificationSettings): string {
  const h = settings.morningDigestHour
  const m = settings.morningDigestMinute
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
