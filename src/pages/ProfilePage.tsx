import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { useAuth } from '../hooks/useAuth'
import { useChores } from '../hooks/useChores'
import { usePwa } from '../hooks/usePwa'
import { CalendarIcon } from '../components/icons'
import {
  getNotificationSettings,
  saveNotificationSettings,
} from '../lib/chores'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { isFirebaseConfigured, getDb, getFirebaseAuth, getFirebaseFunctions, getVapidKey } from '../lib/firebase'
import { httpsCallable } from 'firebase/functions'
import { ensureZeoTaskCalendar } from '../lib/gcal'
import {
  getGCalIntegration,
  saveGCalIntegration,
  getSyncCoordinator,
} from '../lib/syncCoordinator'
import {
  disablePushNotifications,
  enablePushNotifications,
  isStandaloneDisplay,
  notificationPermission,
} from '../lib/push'
import {
  defaultNotificationSettings,
  formatDigestTime,
} from '../lib/userSettings'
import type { Chore, GCalCompletedBehavior, GCalIntegrationDoc, NotificationSettings } from '../types/models'

export function ProfilePage() {
  const { user, logout, updateDisplayName } = useAuth()
  const { chores } = useChores()
  const { needRefresh, updateServiceWorker, installPrompt, promptInstall } = usePwa()
  const [nameDraft, setNameDraft] = useState(user?.displayName ?? '')
  const [editingName, setEditingName] = useState(false)
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [notif, setNotif] = useState<NotificationSettings>(() =>
    defaultNotificationSettings(),
  )
  const [notifBusy, setNotifBusy] = useState(false)
  const [notifMsg, setNotifMsg] = useState<string | null>(null)
  const [pushPerm, setPushPerm] = useState(notificationPermission())
  const [gcalDoc, setGcalDoc] = useState<GCalIntegrationDoc | null>(null)
  const [gcalBusy, setGcalBusy] = useState(false)
  const [gcalMsg, setGcalMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    void getNotificationSettings(user.uid).then(setNotif)
    void getGCalIntegration(user.uid).then(setGcalDoc)
  }, [user])

  async function onConnectGCal() {
    if (!user) return
    setGcalBusy(true)
    setGcalMsg(null)
    try {
      // 1. Preferred: Google Identity Services (GIS) initCodeClient for permanent refresh token
      const googleOAuth = (window as unknown as { google?: { accounts?: { oauth2?: any } } })
        .google?.accounts?.oauth2
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

      // Only attempt GIS code flow if a valid OAuth Web Client ID is configured
      if (googleOAuth && clientId && clientId.includes('-')) {
        try {
          const authCode = await new Promise<string>((resolve, reject) => {
            const client = googleOAuth.initCodeClient({
              client_id: clientId,
              scope: 'https://www.googleapis.com/auth/calendar',
              ux_mode: 'popup',
              callback: (response: { code?: string; error?: string }) => {
                if (response.error) reject(new Error(response.error))
                else if (response.code) resolve(response.code)
                else reject(new Error('No authorization code returned'))
              },
            })
            client.requestCode()
          })

          const exchangeCallable = httpsCallable<
            { code: string },
            { success: boolean; calendarId: string; expiresAt: number }
          >(getFirebaseFunctions(), 'gcalExchangeCode')
          const exchangeRes = await exchangeCallable({ code: authCode })

          if (exchangeRes.data?.success) {
            await saveGCalIntegration(user.uid, {
              needsReauth: false,
              lastAuthError: null,
            })
            const updated = await getGCalIntegration(user.uid)
            setGcalDoc(updated)
            const coordinator = getSyncCoordinator(user.uid)
            await coordinator.triggerSync('initial-connect', chores)
            setGcalMsg("Connected! All active tasks synced to 'ZeoTask' Google Calendar.")
            return
          }
        } catch (gisErr: any) {
          if (
            gisErr?.message?.includes('popup_closed') ||
            gisErr?.message?.includes('access_denied')
          ) {
            setGcalMsg('Sign-in cancelled')
            return
          }
          console.warn('Permanent code exchange failed or skipped; trying popup fallback:', gisErr)
        }
      }

      // 2. Fallback: Firebase signInWithPopup (uses Firebase verified OAuth credentials)
      const provider = new GoogleAuthProvider()
      provider.addScope('https://www.googleapis.com/auth/calendar')
      const customParams: Record<string, string> = {
        prompt: 'consent',
        access_type: 'offline',
      }
      if (user.email) {
        customParams.login_hint = user.email
      }
      provider.setCustomParameters(customParams)
      const res = await signInWithPopup(getFirebaseAuth(), provider)
      const cred = GoogleAuthProvider.credentialFromResult(res)
      const token = cred?.accessToken
      if (!token) throw new Error('Could not obtain Google Calendar authorization')

      let calId = gcalDoc?.calendarId
      if (!calId) {
        calId = await ensureZeoTaskCalendar(token)
      }
      const now = Date.now()
      const docData: GCalIntegrationDoc = {
        enabled: true,
        calendarId: calId,
        calendarName: 'ZeoTask',
        accessToken: token,
        expiresAt: now + 3500 * 1000,
        lastSyncedAt: gcalDoc?.lastSyncedAt ?? null,
        completedTaskBehavior: gcalDoc?.completedTaskBehavior ?? 'keep',
        needsReauth: false,
        lastAuthError: null,
      }

      await saveGCalIntegration(user.uid, docData)
      setGcalDoc(docData)

      const coordinator = getSyncCoordinator(user.uid)
      await coordinator.triggerSync('initial-connect', chores)
      setGcalMsg("Connected! All active tasks synced to 'ZeoTask' Google Calendar.")
    } catch (err) {
      console.error('GCal connect error:', err)
      setGcalMsg(err instanceof Error ? err.message : 'Could not connect Google Calendar')
    } finally {
      setGcalBusy(false)
    }
  }

  async function onSyncNowGCal() {
    if (!user) return
    const isExpired =
      Boolean(gcalDoc?.needsReauth) ||
      Boolean(gcalDoc?.expiresAt && gcalDoc.expiresAt <= Date.now() && !gcalDoc.refreshToken)

    if (isExpired) {
      await onConnectGCal()
      return
    }

    setGcalBusy(true)
    setGcalMsg(null)
    try {
      const coordinator = getSyncCoordinator(user.uid)
      await coordinator.triggerSync('manual-button', chores)

      // Also trigger Cloud Functions backend sync pass
      try {
        const triggerCallable = httpsCallable(getFirebaseFunctions(), 'gcalTriggerSync')
        await triggerCallable()
      } catch {
        // Backend callable is complementary
      }

      const updated = await getGCalIntegration(user.uid)
      setGcalDoc(updated)
      if (updated?.needsReauth) {
        setGcalMsg('Calendar authorization expired. Please reconnect.')
      } else {
        setGcalMsg('Calendar synced successfully')
      }
    } catch (err) {
      setGcalMsg(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setGcalBusy(false)
    }
  }

  async function onDisconnectGCal() {
    if (!user) return
    setGcalBusy(true)
    setGcalMsg(null)
    try {
      await saveGCalIntegration(user.uid, {
        enabled: false,
        accessToken: '',
        refreshToken: '',
        syncToken: null,
      })
      setGcalDoc(null)
      setGcalMsg('Disconnected Google Calendar')
    } catch (err) {
      setGcalMsg(err instanceof Error ? err.message : 'Could not disconnect')
    } finally {
      setGcalBusy(false)
    }
  }

  async function onUpdateCompletedBehavior(next: GCalCompletedBehavior) {
    if (!user || !gcalDoc) return
    setGcalBusy(true)
    setGcalMsg(null)
    try {
      await saveGCalIntegration(user.uid, { completedTaskBehavior: next })
      setGcalDoc((prev) => (prev ? { ...prev, completedTaskBehavior: next } : null))

      const coordinator = getSyncCoordinator(user.uid)
      if (next === 'remove') {
        // Sweep any existing completed events from GCal so zero leftovers remain
        const snap = await getDocs(
          query(
            collection(getDb(), 'users', user.uid, 'chores'),
            where('archivedAt', '!=', null),
          ),
        )
        const completedWithGCal = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Chore))
          .filter((c) => c.gcalEventId || c.subtasks?.some((s) => s.gcalEventId))

        if (completedWithGCal.length > 0) {
          await coordinator.sweepCompletedEvents(completedWithGCal)
        }
        setGcalMsg('Completed tasks will be removed from Google Calendar')
      } else {
        setGcalMsg('Completed tasks will stay on Google Calendar in Graphite Gray (✓)')
      }
    } catch (err) {
      setGcalMsg(err instanceof Error ? err.message : 'Could not update calendar setting')
    } finally {
      setGcalBusy(false)
    }
  }

  async function persistNotif(next: NotificationSettings) {
    if (!user) return
    setNotif(next)
    setNotifBusy(true)
    setNotifMsg(null)
    try {
      await saveNotificationSettings(user.uid, next)
    } catch {
      setNotifMsg('Could not save reminder settings')
    } finally {
      setNotifBusy(false)
    }
  }

  async function onEnablePush() {
    if (!user) return
    setNotifBusy(true)
    setNotifMsg(null)
    try {
      await enablePushNotifications(user.uid)
      setPushPerm(notificationPermission())
      setNotifMsg('Notifications enabled')
    } catch (err) {
      setNotifMsg(err instanceof Error ? err.message : 'Could not enable notifications')
      setPushPerm(notificationPermission())
    } finally {
      setNotifBusy(false)
    }
  }

  async function onDisablePush() {
    if (!user) return
    setNotifBusy(true)
    setNotifMsg(null)
    try {
      await disablePushNotifications(user.uid)
      setPushPerm(notificationPermission())
      setNotifMsg('Notifications disabled on this device')
    } catch {
      setNotifMsg('Could not disable notifications')
    } finally {
      setNotifBusy(false)
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault()
    const next = nameDraft.trim()
    if (!next) {
      setNameError('Name can’t be empty')
      return
    }
    setNameBusy(true)
    setNameError(null)
    try {
      await updateDisplayName(next)
      setEditingName(false)
    } catch {
      setNameError('Could not save name')
    } finally {
      setNameBusy(false)
    }
  }

  const photo = user?.photoURL

  return (
    <div className="space-y-5 pb-8">
      <Link
        to="/"
        className="inline-flex min-h-11 items-center text-sm text-[var(--muted)] hover:text-[var(--accent)]"
      >
        ← Tasks
      </Link>

      <div className="rounded-[var(--radius-modal)] border border-[var(--hairline)] bg-[var(--surface)] p-5">
        <div className="flex items-center gap-4">
          {photo ? (
            <img
              src={photo}
              alt=""
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ink)] text-lg font-semibold text-white">
              {(user?.displayName ?? user?.email ?? '?')[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Account</h2>
            <p className="text-sm text-[var(--muted)]">
              Signed in with Google
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4 border-t border-[var(--hairline)] pt-4">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                Display name
              </p>
              {!editingName && (
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--accent)]"
                  onClick={() => {
                    setNameDraft(user?.displayName ?? '')
                    setEditingName(true)
                    setNameError(null)
                  }}
                >
                  Edit
                </button>
              )}
            </div>
            {editingName ? (
              <form onSubmit={(e) => void saveName(e)} className="mt-2 flex gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="focus-ring min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--hairline)] px-3 py-2 text-sm"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={nameBusy}
                  className="focus-ring rounded-[var(--radius-control)] bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  className="focus-ring rounded-[var(--radius-control)] px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--quiet)]"
                  onClick={() => {
                    setEditingName(false)
                    setNameError(null)
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <p className="mt-1 text-sm font-medium text-[var(--ink)]">
                {user?.displayName ?? '-'}
              </p>
            )}
            {nameError && (
              <p className="mt-1 text-xs text-[var(--danger)]">{nameError}</p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
              Email
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--ink)]">
              {user?.email ?? '-'}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              From Google. Change it in your Google account.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
              Timezone
            </p>
            <p className="mt-1 text-sm text-[var(--ink)]">
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Detected from this device.
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--hairline)] pt-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Reminders</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Morning overview defaults to 8:00 AM. Adjust anytime.
          </p>

          {!getVapidKey() && (
            <p className="mt-2 text-xs text-[var(--due-soon)]">
              Add VITE_FIREBASE_VAPID_KEY to .env to enable device push.
            </p>
          )}

          {typeof navigator !== 'undefined' &&
            /iPhone|iPad/.test(navigator.userAgent) &&
            !isStandaloneDisplay() && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                On iPhone, add ZeoTask to your Home Screen to receive pushes.
              </p>
            )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={notifBusy || pushPerm === 'unsupported'}
              onClick={() => void onEnablePush()}
              className="focus-ring rounded-[var(--radius-control)] bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {pushPerm === 'granted' ? 'Refresh device token' : 'Enable notifications'}
            </button>
            {pushPerm === 'granted' && (
              <button
                type="button"
                disabled={notifBusy}
                onClick={() => void onDisablePush()}
                className="focus-ring rounded-[var(--radius-control)] border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--muted)]"
              >
                Disable on this device
              </button>
            )}
          </div>
          <p className="mt-1.5 font-mono-meta text-[11px] text-[var(--muted)]">
            Permission: {pushPerm}
          </p>

          <ul className="mt-4 space-y-3">
            <li className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--ink)]">Morning overview</p>
                <p className="text-xs text-[var(--muted)]">
                  Today + overdue summary ({formatDigestTime(notif)})
                </p>
              </div>
              <input
                type="checkbox"
                checked={notif.morningDigestEnabled}
                onChange={(e) =>
                  void persistNotif({
                    ...notif,
                    morningDigestEnabled: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </li>
            <li className="flex items-center justify-between gap-3">
              <label className="text-sm text-[var(--ink)]" htmlFor="digest-time">
                Morning time
              </label>
              <input
                id="digest-time"
                type="time"
                value={`${String(notif.morningDigestHour).padStart(2, '0')}:${String(notif.morningDigestMinute).padStart(2, '0')}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number)
                  void persistNotif({
                    ...notif,
                    morningDigestHour: h,
                    morningDigestMinute: m,
                  })
                }}
                className="rounded-lg border border-[var(--hairline)] px-2 py-1 text-sm"
              />
            </li>
            <li className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--ink)]">Due time</p>
                <p className="text-xs text-[var(--muted)]">When a task is due</p>
              </div>
              <input
                type="checkbox"
                checked={notif.dueRemindersEnabled}
                onChange={(e) =>
                  void persistNotif({
                    ...notif,
                    dueRemindersEnabled: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </li>
            <li className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--ink)]">Before due</p>
                <p className="text-xs text-[var(--muted)]">
                  Uses each task’s pre-due hours (default 24h)
                </p>
              </div>
              <input
                type="checkbox"
                checked={notif.predueRemindersEnabled}
                onChange={(e) =>
                  void persistNotif({
                    ...notif,
                    predueRemindersEnabled: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </li>
            <li className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--ink)]">Overdue nudge</p>
                <p className="text-xs text-[var(--muted)]">About 2 hours after due</p>
              </div>
              <input
                type="checkbox"
                checked={notif.overdueNudgeEnabled}
                onChange={(e) =>
                  void persistNotif({
                    ...notif,
                    overdueNudgeEnabled: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </li>
          </ul>
          {notifMsg && (
            <p className="mt-2 text-xs text-[var(--muted)]">{notifMsg}</p>
          )}
        </div>

        <div className="mt-4 border-t border-[var(--hairline)] pt-4">
          {(() => {
            const isGCalExpired =
              Boolean(gcalDoc?.needsReauth) ||
              Boolean(gcalDoc?.expiresAt && gcalDoc.expiresAt <= Date.now() && !gcalDoc.refreshToken)

            return (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarIcon size={18} className="text-[var(--accent)]" />
                    <h3 className="text-sm font-semibold text-[var(--ink)]">
                      Google Calendar 2-Way Sync
                    </h3>
                  </div>
                  {gcalDoc?.enabled && (
                    isGCalExpired ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Reconnect Required
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    )
                  )}
                </div>

                <p className="mt-1 text-xs text-[var(--muted)]">
                  Two-way sync with a dedicated <strong>"ZeoTask"</strong> calendar in Google Calendar. All-day tasks sit in the all-day banner; timed tasks sync as 30-min slots. Deleting in either place deletes on both sides.
                </p>

                {gcalDoc?.enabled ? (
                  <div className="mt-3 space-y-3">
                    {isGCalExpired && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                        <div className="flex items-start gap-2">
                          <span className="text-amber-600 dark:text-amber-400 font-bold mt-0.5">⚠️</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[var(--ink)]">Google Calendar session expired</p>
                            <p className="mt-0.5 text-[11px] text-[var(--muted)] leading-relaxed">
                              Your authorization has expired. Click <strong>Reconnect Google Calendar</strong> below to restore automatic 2-way sync with your dedicated "ZeoTask" calendar.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-sunken)] p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--muted)]">Calendar</span>
                        <span className="font-medium text-[var(--ink)]">
                          {gcalDoc.calendarName || 'ZeoTask'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[var(--muted)]">Last synced</span>
                        <span className="font-mono-meta text-[var(--ink)]">
                          {gcalDoc.lastSyncedAt
                            ? new Date(gcalDoc.lastSyncedAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Never'}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-sunken)] p-3 text-xs space-y-2.5">
                      <div>
                        <span className="font-semibold text-[var(--ink)] block">
                          Completed Tasks on Calendar
                        </span>
                        <span className="text-[11px] text-[var(--muted)] block mt-0.5">
                          Choose what happens to Google Calendar events when you complete a task in ZeoTask.
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={gcalBusy}
                          onClick={() => void onUpdateCompletedBehavior('keep')}
                          className={`flex items-start gap-2.5 p-2.5 rounded-[var(--radius-control)] border text-left transition ${
                            (gcalDoc.completedTaskBehavior ?? 'keep') === 'keep'
                              ? 'border-[var(--accent)] bg-[var(--accent-wash)] ring-1 ring-[var(--accent)] text-[var(--ink)]'
                              : 'border-[var(--hairline)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--ink)]/30'
                          }`}
                        >
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">✓</span>
                          <div>
                            <div className="text-xs font-semibold text-[var(--ink)]">Keep on calendar</div>
                            <div className="text-[11px] text-[var(--muted)] mt-0.5 leading-relaxed">
                              Prefixed with ✓ and marked Graphite Gray. Keeps a record of finished work.
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          disabled={gcalBusy}
                          onClick={() => void onUpdateCompletedBehavior('remove')}
                          className={`flex items-start gap-2.5 p-2.5 rounded-[var(--radius-control)] border text-left transition ${
                            gcalDoc.completedTaskBehavior === 'remove'
                              ? 'border-[var(--accent)] bg-[var(--accent-wash)] ring-1 ring-[var(--accent)] text-[var(--ink)]'
                              : 'border-[var(--hairline)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--ink)]/30'
                          }`}
                        >
                          <span className="text-sm font-bold text-[var(--muted)] mt-0.5">✕</span>
                          <div>
                            <div className="text-xs font-semibold text-[var(--ink)]">Remove from calendar</div>
                            <div className="text-[11px] text-[var(--muted)] mt-0.5 leading-relaxed">
                              Immediately deletes events upon completion to keep your calendar clear.
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {isGCalExpired ? (
                        <button
                          type="button"
                          disabled={gcalBusy}
                          onClick={() => void onConnectGCal()}
                          className="focus-ring inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-pressed)] disabled:opacity-50"
                        >
                          <CalendarIcon size={16} />
                          {gcalBusy ? 'Connecting...' : 'Reconnect Google Calendar'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={gcalBusy}
                          onClick={() => void onSyncNowGCal()}
                          className="focus-ring inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {gcalBusy ? 'Syncing...' : 'Sync Now'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={gcalBusy}
                        onClick={() => void onDisconnectGCal()}
                        className="focus-ring rounded-[var(--radius-control)] border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--quiet)]"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={gcalBusy}
                      onClick={() => void onConnectGCal()}
                      className="focus-ring inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-pressed)] disabled:opacity-50"
                    >
                      <CalendarIcon size={16} />
                      {gcalBusy ? 'Connecting...' : 'Connect Google Calendar'}
                    </button>
                  </div>
                )}
              </>
            )
          })()}

          {gcalMsg && (
            <p className="mt-2 text-xs text-[var(--muted)]" aria-live="polite">
              {gcalMsg}
            </p>
          )}
        </div>

        {installPrompt && (
          <div className="mt-4 border-t border-[var(--hairline)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--ink)]">App Installation</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Install ZeoTask locally on your device for a native, standalone experience.
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="focus-ring rounded-[var(--radius-control)] bg-[var(--accent)] px-3 py-2 text-sm text-white"
              >
                Install App
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-[var(--hairline)] pt-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Shortcuts</h3>
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-[11px] font-medium tracking-wide text-[var(--muted)] uppercase">
                Anywhere
              </p>
              <ul className="mt-1.5 space-y-1.5 text-[13px] text-[var(--ink)]">
                <li className="flex gap-3">
                  <span className="font-mono-meta w-[7.5rem] shrink-0 text-[12px] text-[var(--muted)]">
                    C · N
                  </span>
                  <span className="text-[var(--muted)]">
                    New task (when not typing in a field)
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono-meta w-[7.5rem] shrink-0 text-[12px] text-[var(--muted)]">
                    ⌘K · ⌘N
                  </span>
                  <span className="text-[var(--muted)]">New task</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono-meta w-[7.5rem] shrink-0 text-[12px] text-[var(--muted)]">
                    ⌘F
                  </span>
                  <span className="text-[var(--muted)]">Search tasks</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono-meta w-[7.5rem] shrink-0 text-[12px] text-[var(--muted)]">
                    Esc
                  </span>
                  <span className="text-[var(--muted)]">
                    Close search or the task modal
                  </span>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-medium tracking-wide text-[var(--muted)] uppercase">
                In Quick Add / edit
              </p>
              <ul className="mt-1.5 space-y-1.5 text-[13px] text-[var(--ink)]">
                <li className="flex gap-3">
                  <span className="font-mono-meta w-[7.5rem] shrink-0 text-[12px] text-[var(--muted)]">
                    Enter
                  </span>
                  <span className="text-[var(--muted)]">
                    Save from the title field
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono-meta w-[7.5rem] shrink-0 text-[12px] text-[var(--muted)]">
                    ⌘↵
                  </span>
                  <span className="text-[var(--muted)]">Save task</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono-meta w-[7.5rem] shrink-0 text-[12px] text-[var(--muted)]">
                    ⌘E
                  </span>
                  <span className="text-[var(--muted)]">
                    Jump to notes / description
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono-meta w-[7.5rem] shrink-0 text-[12px] text-[var(--muted)]">
                    ⌘J
                  </span>
                  <span className="text-[var(--muted)]">
                    Jump to checklist (add item)
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono-meta w-[7.5rem] shrink-0 text-[12px] text-[var(--muted)]">
                    Tab
                  </span>
                  <span className="text-[var(--muted)]">
                    Cycle fields inside the modal
                  </span>
                </li>
              </ul>
            </div>
            <p className="text-[11px] text-[var(--muted)]">
              On Windows or Linux, use Ctrl in place of ⌘.
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs text-[var(--muted)]">
          Data: Firestore offline cache
          {isFirebaseConfigured() ? ' · connected' : ' · missing .env'}
        </p>

        {needRefresh && (
          <button
            type="button"
            className="focus-ring mt-4 rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-2 text-sm text-white"
            onClick={() => {
              void updateServiceWorker(true)
            }}
          >
            Update available. Refresh
          </button>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/completed"
            className="focus-ring rounded-[var(--radius-control)] border border-[var(--hairline)] px-4 py-2 text-sm text-[var(--ink)] hover:bg-[var(--quiet)]"
          >
            View completed
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="focus-ring rounded-[var(--radius-control)] border border-red-200 px-4 py-2 text-sm text-[var(--danger)]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
