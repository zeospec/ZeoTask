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
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  }),
)

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

onBackgroundMessage(messaging, (payload) => {
  const title = payload.notification?.title || payload.data?.title || 'ZeoTask'
  const body = payload.notification?.body || payload.data?.body || ''
  const data = payload.data || {}
  void self.registration.showNotification(title, {
    body,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    data,
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = (event.notification.data || {}) as { choreId?: string }
  const path = data.choreId ? `/chore/${data.choreId}` : '/'
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
