# ZeoTask

Personal solo chores PWA - Donetick-inspired flow on Firebase.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Firebase Auth / Firestore (persistent offline cache) / Hosting-ready
- PWA via `vite-plugin-pwa`

## Setup

1. Create a Firebase project (or use an existing one).
2. Enable **Authentication** → Google.
3. Create a Firestore database.
4. Deploy rules: `npx -y firebase-tools@latest deploy --only firestore:rules`
5. Copy env and fill web config:

```bash
cp .env.example .env
```

6. Install & run:

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` - local app
- `npm run build` - production build to `dist/`
- `npm run preview` - preview production build

## Data model

All data lives under `users/{uid}/…` (chores, choreHistory, …). See `firestore.rules`.

## Roadmap

Phase 1 (done in scaffold): auth, chore list, create/complete/skip, recurrence basics, NL hints, subtasks, activity, PWA shell, offline persistence.

Next: full recurrence set, Things, timers, adaptive, filters/projects, analytics, FCM web push.
