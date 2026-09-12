import { deleteToken, getToken } from 'firebase/messaging'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { getDb, getFirebaseMessaging, getVapidKey } from './firebase'

function tokenDocId(token: string) {
  let hash = 0
  for (let i = 0; i < token.length; i++) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0
  }
  return `t${hash.toString(16)}`
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'unknown'
  const key = 'zeotask_device_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = `d_${Math.random().toString(36).substring(2, 11)}_${Date.now().toString(36)}`
    localStorage.setItem(key, id)
  }
  return id
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

/** Register FCM token and store under the user with device deduplication. */
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

  const deviceId = getDeviceId()
  const isStandalone = isStandaloneDisplay()
  const currentDocId = tokenDocId(token)

  await setDoc(
    doc(getDb(), 'users', uid, 'pushTokens', currentDocId),
    {
      token,
      deviceId,
      isStandalone,
      userAgent: navigator.userAgent,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )

  await setDoc(
    doc(getDb(), 'users', uid),
    { hasPushTokens: true, updatedAt: serverTimestamp() },
    { merge: true },
  )

  // Prune any previous/obsolete tokens for this device or replaced browser tokens
  try {
    const snap = await getDocs(collection(getDb(), 'users', uid, 'pushTokens'))
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

    for (const d of snap.docs) {
      if (d.id === currentDocId) continue
      const data = d.data()
      // Same deviceId -> delete older token
      if (data.deviceId === deviceId || (isStandalone && isMobile && !data.isStandalone)) {
        await deleteDoc(doc(getDb(), 'users', uid, 'pushTokens', d.id)).catch(() => {})
      }
    }
  } catch (err) {
    console.warn('Failed to prune previous push tokens', err)
  }

  return token
}

/**
 * Automatically reconciles and syncs push token when the app opens.
 * If running in standalone PWA mode and notifications are granted, ensures the PWA
 * token is registered and any older duplicate browser token on this device is purged.
 */
export async function syncPushTokens(uid: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return
  }
  const vapidKey = getVapidKey()
  if (!vapidKey) return

  try {
    const messaging = await getFirebaseMessaging()
    if (!messaging) return
    const registration = await navigator.serviceWorker.ready
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    })
    if (!token) return

    const deviceId = getDeviceId()
    const isStandalone = isStandaloneDisplay()
    const currentDocId = tokenDocId(token)

    await setDoc(
      doc(getDb(), 'users', uid, 'pushTokens', currentDocId),
      {
        token,
        deviceId,
        isStandalone,
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )

    // Clean up duplicate/stale tokens for this device in Firestore
    const snap = await getDocs(collection(getDb(), 'users', uid, 'pushTokens'))
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

    for (const d of snap.docs) {
      if (d.id === currentDocId) continue
      const data = d.data()
      if (data.deviceId === deviceId || (isStandalone && isMobile && !data.isStandalone)) {
        await deleteDoc(doc(getDb(), 'users', uid, 'pushTokens', d.id)).catch(() => {})
      }
    }
  } catch (err) {
    // Non-blocking sync
    console.warn('Failed to sync push tokens', err)
  }
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
    await setDoc(
      doc(getDb(), 'users', uid),
      { hasPushTokens: false, updatedAt: serverTimestamp() },
      { merge: true },
    )
  } catch {
    // Best-effort disable.
  }
}
