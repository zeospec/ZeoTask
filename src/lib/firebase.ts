import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  type Auth,
} from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging'
import { getStorage } from 'firebase/storage'

export const firebaseConfig = {
  apiKey: "AIzaSyCODVzv3vtC2CYLMNtd03l1KjS-GDjXxas",
  authDomain: "zeotask.firebaseapp.com",
  databaseURL: "https://zeotask-default-rtdb.firebaseio.com",
  projectId: "zeotask",
  storageBucket: "zeotask.firebasestorage.app",
  messagingSenderId: "395410156315",
  appId: "1:395410156315:web:a17662cfbc05017a1281be"
}

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
}

// Replace with your Firebase Cloud Messaging VAPID key for web push
export const vapidKey = 'BDIEjFD1SHtq46xMq5hx08XlWVNn3G3tFF-4FVea7CB2JTEUDRQkuf5PBAkcT0jxmPlrKxyf5O-OZyvQYM6vJRE'

export function getVapidKey(): string | undefined {
  return vapidKey && vapidKey.trim() ? vapidKey.trim() : undefined
}

let app: FirebaseApp | undefined
let auth: Auth | undefined
let db: Firestore | undefined
let messaging: Messaging | undefined

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured. Copy .env.example to .env and fill in your project keys.',
    )
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig)
  }
  return app
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    const firebaseApp = getFirebaseApp()
    try {
      // Latest firebase (12.17+) defaults to IndexedDB auth persistence, which
      // throws "Database is closing/hidden" when a Google popup backgrounds the
      // tab (firebase-js-sdk#10264). Force localStorage + explicit popup resolver.
      auth = initializeAuth(firebaseApp, {
        persistence: browserLocalPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      })
    } catch {
      // Hot reload / second call - Auth already initialized for this app.
      auth = getAuth(firebaseApp)
    }
  }
  return auth
}

export function getDb(): Firestore {
  if (!db) {
    db = initializeFirestore(getFirebaseApp(), {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  }
  return db
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null
  if (!(await isSupported())) return null
  if (!messaging) {
    messaging = getMessaging(getFirebaseApp())
  }
  return messaging
}

export function getFirebaseStorage() {
  return getStorage(getFirebaseApp())
}

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
