import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useLabels } from '../hooks/useLabels'
import { usePwa } from '../hooks/usePwa'
import {
  getNotificationSettings,
  saveNotificationSettings,
} from '../lib/chores'
import { isFirebaseConfigured, getVapidKey } from '../lib/firebase'
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
import type { NotificationSettings } from '../types/models'

export function ProfilePage() {
  const { user, logout, updateDisplayName } = useAuth()
  const { labels, rename, remove } = useLabels()
  const { needRefresh, updateServiceWorker } = usePwa()
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
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

  useEffect(() => {
    if (!user) return
    void getNotificationSettings(user.uid).then(setNotif)
  }, [user])

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

      <section className="rounded-[var(--radius-modal)] border border-[var(--hairline)] bg-[var(--surface)] p-5">
        <h3 className="text-base font-semibold text-[var(--ink)]">Labels</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Used from #tags when creating tasks. Rename or delete here.
        </p>
        <ul className="mt-3 space-y-2">
          {labels.length === 0 && (
            <li className="text-sm text-[var(--muted)]">No labels yet.</li>
          )}
          {labels.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-2 rounded-[10px] border border-[var(--hairline)] px-3 py-2"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: l.color }}
              />
              {renameId === l.id ? (
                <form
                  className="flex min-w-0 flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void rename(l.id, renameDraft).then(() => setRenameId(null))
                  }}
                >
                  <input
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-[var(--hairline)] px-2 py-1 text-sm"
                    autoFocus
                  />
                  <button type="submit" className="text-sm text-[var(--accent)]">
                    Save
                  </button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-sm">#{l.name}</span>
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)]"
                    onClick={() => {
                      setRenameId(l.id)
                      setRenameDraft(l.name)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="text-xs text-[var(--danger)]"
                    onClick={() => void remove(l.id)}
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
