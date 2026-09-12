/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

clientsClaim()

// workbox-build (injectManifest) requires exactly ONE occurrence of self.__WB_MANIFEST.
// Store it in a const so we can reference it multiple times safely.
const WB_MANIFEST = self.__WB_MANIFEST
precacheAndRoute(WB_MANIFEST)
cleanupOutdatedCaches()

// Only register the navigation route when /index.html is actually precached.
// In dev mode the manifest is empty, so createHandlerBoundToURL would throw
// "non-precached-url" for every navigation request.
const isPrecached = WB_MANIFEST.some((entry) => {
  const url = typeof entry === 'string' ? entry : entry.url
  return url === '/index.html' || url.includes('index.html')
})
if (isPrecached) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
      denylist: [/^\/api\//],
    }),
  )
}

const firebaseConfig = {
  apiKey: "AIzaSyCODVzv3vtC2CYLMNtd03l1KjS-GDjXxas",
  authDomain: "zeotask.firebaseapp.com",
  databaseURL: "https://zeotask-default-rtdb.firebaseio.com",
  projectId: "zeotask",
  storageBucket: "zeotask.firebasestorage.app",
  messagingSenderId: "395410156315",
  appId: "1:395410156315:web:a17662cfbc05017a1281be"
}

initializeApp(firebaseConfig)
const messaging = getMessaging()

onBackgroundMessage(messaging, async (payload) => {
  // If the push message already includes a notification payload, Firebase Messaging SDK's
  // internal SW listener displays it automatically. Calling showNotification here
  // causes a duplicate notification (one from Firebase/browser, one from this callback).
  if (payload.notification) {
    return
  }

  // Check if an existing window client is already visible and focused.
  // Suppress background notification if user is actively in the app.
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const hasFocusedWindow = clients.some((c) => 'focused' in c && (c as WindowClient).focused)
  if (hasFocusedWindow) {
    return
  }

  const title = payload.data?.title || 'ZeoTask'
  const body = payload.data?.body || ''
  const tag =
    payload.data?.tag ||
    (payload.data?.choreId ? `chore-${payload.data.choreId}` : 'zeotask-notification')
  const data = payload.data || {}

  await self.registration.showNotification(title, {
    body,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag,
    data,
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = (event.notification.data || {}) as { choreId?: string; fcmOptions?: { link?: string } }
  let path = '/'
  if (data.choreId) {
    path = `/chore/${data.choreId}`
  } else if (data.fcmOptions?.link) {
    path = data.fcmOptions.link
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ('focus' in client) {
            const win = client as WindowClient
            void win.navigate?.(path)
            return win.focus()
          }
        }
        return self.clients.openWindow(path)
      }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})
