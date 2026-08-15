import { deleteToken, getToken } from 'firebase/messaging'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDb, getFirebaseMessaging, getVapidKey } from './firebase'

function tokenDocId(token: string) {
  let hash = 0
  for (let i = 0; i < token.length; i++) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0
  }
  return `t${hash.toString(16)}`
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone) return true
  return window.matchMedia('(display-mode: standalone)').matches
}

/** Register FCM token and store under the user. */
export async function enablePushNotifications(uid: string): Promise<string> {
  const vapidKey = getVapidKey()
  if (!vapidKey) {
    throw new Error(
      'Missing VITE_FIREBASE_VAPID_KEY. Add your Web Push certificate key from Firebase Console.',
    )
  }
  if (typeof Notification === 'undefined') {
    throw new Error('Notifications are not supported in this browser.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const messaging = await getFirebaseMessaging()
  if (!messaging) {
    throw new Error('Push messaging is not supported on this device.')
  }

  const registration = await navigator.serviceWorker.ready
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  })
  if (!token) throw new Error('Could not get a push token.')

  await setDoc(
    doc(getDb(), 'users', uid, 'pushTokens', tokenDocId(token)),
    {
      token,
      userAgent: navigator.userAgent,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )

  return token
}

export async function disablePushNotifications(uid: string): Promise<void> {
  const messaging = await getFirebaseMessaging()
  if (!messaging) return
  try {
    const registration = await navigator.serviceWorker.ready
    const vapidKey = getVapidKey()
    if (vapidKey) {
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      })
      if (token) {
        await deleteDoc(doc(getDb(), 'users', uid, 'pushTokens', tokenDocId(token)))
      }
    }
    await deleteToken(messaging)
  } catch {
    // Best-effort disable.
  }
}
