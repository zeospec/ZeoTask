# ZeoTask

A personal solo tasks PWA with an Advanced Planning Engine, drag-and-drop calendar scheduling, and offline-first Firestore syncing.

## Stack

- Vite 8 + React 19 + TypeScript
- Tailwind CSS v4
- Firebase Auth (Google) / Firestore (persistent local cache)
- Firebase Cloud Messaging (FCM) & Cloud Functions for Push Notifications
- PWA via `vite-plugin-pwa` (injectManifest strategy)
- Custom Netlify deployment configuration

## Core Features

- **Advanced Planning Engine:** Agenda, Week, and Month views powered by a robust View Selector.
- **Drag-and-Drop Scheduling:** Instantly snap tasks to new dates across the calendar using `@dnd-kit`.
- **Smart Natural Language:** Type "P1" or "tomorrow at 5pm" to automatically extract priorities and due dates.
- **Offline-First:** Full Firestore local cache. Edit tasks on an airplane, and they sync when you land.
- **Push Notifications:** Background Cloud Functions handle due-date reminders, pre-due warnings, and morning daily digests straight to your mobile device.
- **True PWA:** Installs natively on iOS/Android as a standalone app with custom Apple touch icons and splash screens.

## Setup

1. Copy env and fill web config:

```bash
cp .env.example .env
```

2. Ensure you have the `VITE_FIREBASE_VAPID_KEY` for push notifications.

3. Install & run:

```bash
npm install
npm run dev
```

4. Deploy Cloud Functions:
```bash
cd functions
npm run build
firebase deploy --only functions
```

## Production Deployment

Deployed to Netlify via `netlify.toml`. All PWA caching headers and SPA redirects are pre-configured to ensure seamless over-the-air updates.
