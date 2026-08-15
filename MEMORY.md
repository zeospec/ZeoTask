# MEMORY.md

Durable knowledge for ZeoTask. Read at session start (see `AGENTS.md`).

## Project

- **Name:** ZeoTask
- **Path:** `/Users/zeospec/Dev/Code/ZeoTask`
- **Purpose:** Personal solo **Donetick-faithful** tasks PWA on Firebase
- **Context pack:** Self-contained; no prior chat required
- **Visual system:** Mineral forest green (UXMagic export). Plan: [`docs/plans/2026-08-13-001-visual-revamp-plan.md`](./docs/plans/2026-08-13-001-visual-revamp-plan.md). Live UI matches [`DESIGN.md`](./DESIGN.md).

## Locked direction (summary)

Solo · Donetick-faithful UX · mineral forest green visual · optimistic Firestore mutations · PWA · Vite+React+TS+Tailwind · Google Auth · no Capacitor/Docker/Next.

## Stack (as implemented)

- Vite 8 + React 19 + TypeScript 7 + Tailwind 4 + React Router 7
- Firebase Auth (Google popup, `browserLocalPersistence`) + Firestore `persistentLocalCache` + PWA
- Domain: `src/lib/scheduler.ts`, `src/lib/chores.ts`, `src/lib/labels.ts`
- Providers: `ChoresProvider`, `LabelsProvider` under `AuthProvider`
- Rules: `firestore.rules` · Project: `testtodoistclone`

## Commands

```bash
cd /Users/zeospec/Dev/Code/ZeoTask
cp .env.example .env
npm install
npm run dev
npm run build
```

## Schema (Firestore)

- `users/{uid}` — profile (write on Google sign-in only)
- `users/{uid}/chores/{id}` — tasks (`repeatEvery`, `repeatWeekdays`, `archivedAt`)
- `users/{uid}/labels/{id}` — labels
- No choreHistory / Activity writes

## Progress

- **Stages A–C done:** optimistic create/complete/edit; Undo toast; labels; ⌘F search; richer recurrence; sync cue; a11y; safe-area.
- **Visual revamp 100% done:** forest green tokens, brand shell, card rows, type-only composer, Daily Complete empty, Quick Add modal skin, detail/search/toast/profile/login.
- **Push + Quick Add polish in progress/shipped client:** label NLP fix, anchored menus, due live feedback, Move to today, Profile Reminders, FCM client + injectManifest SW, Cloud Function `reminderTick`.

## Gotchas

- UI must **not** await Firestore write ACK before closing modal / clearing busy — use `createChore` `{ id, promise }` + `ChoresProvider` helpers.
- Auth: `initializeAuth` + `browserLocalPersistence` + popup resolver (firebase-js-sdk#10264).
- Every chore needs `updatedAt` (list `orderBy`).
- Prefer **task** in UI; collection remains `chores`.
- Create chrome: bottom **Type a task…** only — no top Add.
- **PWA:** SW registers at app start (`PwaProvider`). Installed/standalone uses Google **redirect** auth (popup on desktop browser). Deploy on HTTPS (Firebase Hosting); add the production domain under Auth authorized domains.
- **Push:** set `VITE_FIREBASE_VAPID_KEY`; deploy `functions` (`reminderTick` every 5 min). iOS needs Home Screen install. Brand in notifications: **ZeoTask**.

## Session log

- **2026-08-12:** Stages A–C implemented (feel, labels/search/recurrence, sync/a11y/perf).
- **2026-08-13:** Create/edit modal redesign — single-line smart title (cursor fix), always-on rich notes + nested checklist; Grammarly disabled on fields.
- **2026-08-13:** UXMagic export reviewed; visual revamp plan written.
- **2026-08-13:** Visual revamp 100% implemented (tokens → shell → list → modal → secondary surfaces).
- **2026-08-13:** UX fine-tune — drop ⋯/chevron; tap row → edit; plain title typing (no overlay); neat checklist; search dividers; detail Edit/Delete.
- **2026-08-13:** Profile menu + Google photo; `/completed` archive-only page; editable display name; email noted as Google-owned. One Tap / FedCM sign-in = future.
- **2026-08-13:** Quick Add title: clinical bordered field, no helper line; NLP accepts natural `P1`–`P4` (bang optional).
- **2026-08-13:** PWA hardening: app-wide SW register, iOS meta/icons, maskable icon, font runtime cache, hosting SW headers, standalone redirect auth.
- **2026-08-13:** Spec + plan for push (FCM digest/due/predue/overdue), Move to today, Quick Add label/menu/due fixes. Brand locked **ZeoTask**.
- **2026-08-13:** Implemented Quick Add fixes, Move to today, Profile Reminders, FCM client/SW (`injectManifest`), Cloud Function scheduler.
- **2026-08-15:** Fixed `dnd-kit` collision detection in CalendarView using `pointerWithin` for precise drag-and-drop. Added single-key shortcuts (`a`, `w`, `m`) for quick view switching.
- **2026-08-15:** Integrated Project and Label management directly into the Sidebar using hover menus (`...`) and `EntityManageModal`. Projects support custom colors; Labels do not. Removed redundant label settings from Profile.
- **2026-08-15:** Enhanced PWA behavior: added a permanent "Install App" block in Profile settings (for deferred installations) and a global "Update Available" banner in `AppShell` (tied to `vite-plugin-pwa`'s `needRefresh`) to seamlessly force SW updates without manual cache clearing.
