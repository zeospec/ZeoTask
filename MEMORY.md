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
- Domain: `src/lib/scheduler.ts`, `src/lib/chores.ts`, `src/lib/labels.ts`, `src/lib/projects.ts`, `src/lib/taskParsers.ts`
- Providers: `ChoresProvider`, `LabelsProvider`, `ProjectsProvider` under `AuthProvider`
- Rules: `firestore.rules` · Project: `testtodoistclone`
- Deploy: Netlify (`netlify.toml`), custom domain `task.zeospec.com`

## Component map

| Component | Purpose |
|-----------|---------|
| `AppShell.tsx` | Root layout: sticky header, sticky bottom bar, sidebar, routes. Bridges `InlineQuickAdd` → `CreateTaskModal` via `CreateOverrides`. |
| `InlineQuickAdd.tsx` | Bottom bar "Type a task…" with NLP parsing, `@project`/`#label` autocomplete trays, send (↑) and expand (+) buttons. |
| `CreateTaskModal.tsx` | Full task create/edit modal with smart title, due/repeat/priority/labels/project pickers, notes, checklist. |
| `SmartTaskTitleInput.tsx` | `contentEditable` input with inline NLP highlight overlays (date, priority, project, label). |
| `EntityManageModal.tsx` | Edit/delete modal for projects (with color picker) and labels. Portals to `document.body`. Bottom-sheet on mobile. |
| `Sidebar.tsx` | Left slide-out drawer: navigation, project list, label list with always-visible vertical-dot edit buttons. |
| `CalendarView.tsx` | Week/month calendar views with `dnd-kit` drag-and-drop (uses `pointerWithin` collision). |
| `FilterMenu.tsx` | Filter popover for task list (priority, labels, due). |
| `ChoreRow.tsx` | Individual task card in the list. |
| `DueDatePicker.tsx` | Calendar-style date picker used in create/edit. |
| `SearchOverlay.tsx` | ⌘F full-text search overlay. |
| `ToastStack.tsx` | Stacking undo/info toasts. |
| `Modal.tsx` | Unified reusable modal/sheet component with portal, scroll lock, Escape handler, and history back sync. |

## Hooks

| Hook | Purpose |
|------|---------|
| `useAuth.tsx` | Auth context + Google sign-in/out |
| `useChores.tsx` | CRUD + real-time Firestore subscription for tasks |
| `useLabels.tsx` | CRUD + subscription for labels |
| `useProjects.tsx` | CRUD + subscription for projects |
| `usePwa.tsx` | Install prompt, SW update detection |
| `useViews.tsx` | View-related state (agenda/week/month) |
| `useModalBack.ts` | Stack-aware history synchronizer: syncs modal open/close with hardware/swipe back. |
| `usePwaExitGuard.ts` | Double-back exit guard for mobile/standalone PWA: coordinated with useModalBack to only guard bare home screen. |
| `useClickOutside.ts` | Reusable document pointerdown click-outside hook for dropdowns and popovers. |

## Lib modules

| Module | Purpose |
|--------|---------|
| `taskParsers.ts` | NLP: extracts due date (chrono-node), priority (P1–P4), project (@), labels (#), frequency from raw text. Last-match-wins for all. |
| `scheduler.ts` | Date formatting, next-due calculation, recurrence logic |
| `chores.ts` | Firestore CRUD for tasks |
| `labels.ts` | Firestore CRUD for labels + `ensureLabelIds` |
| `projects.ts` | Firestore CRUD for projects + `ensureProjectIds` + `PROJECT_COLORS` |
| `push.ts` | FCM push notification registration |
| `firebase.ts` | Firebase app/auth/firestore init |
| `userSettings.ts` | User preferences persistence |
| `views.ts` | View-related utilities |
| `html.ts` | HTML sanitization helpers |

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
- `users/{uid}/chores/{id}` — tasks (`repeatEvery`, `repeatWeekdays`, `archivedAt`, `labelIds`, `projectId`, `subtasks`, `description`)
- `users/{uid}/labels/{id}` — labels (`name`, `createdAt`, `updatedAt`)
- `users/{uid}/projects/{id}` — projects (`name`, `color`, `createdAt`, `updatedAt`)
- No choreHistory / Activity writes

## Progress

- **Stages A–C done:** optimistic create/complete/edit; Undo toast; labels; ⌘F search; richer recurrence; sync cue; a11y; safe-area.
- **Visual revamp 100% done:** forest green tokens, brand shell, card rows, type-only composer, Daily Complete empty, Quick Add modal skin, detail/search/toast/profile/login.
- **Push + Quick Add polish shipped:** label NLP fix, anchored menus, due live feedback, Move to today, Profile Reminders, FCM client + injectManifest SW, Cloud Function `reminderTick`.
- **NLP + Inline Quick Add hardened:** last-match-wins for priority/project/date, `@project` and `#label` autocomplete trays, structured overrides flow (InlineQuickAdd → AppShell → CreateTaskModal), title stripping of trigger tokens.
- **Sidebar + Entity Management:** Projects and Labels manageable from sidebar with always-visible vertical-dot edit buttons, EntityManageModal portals to body (avoids sidebar transform clipping), custom color picker for projects.
- **Layout polish:** Sticky header with backdrop-blur, send button (↑) in quick add bar, bottom-sheet modals on mobile.

## Gotchas

- UI must **not** await Firestore write ACK before closing modal / clearing busy — use `createChore` `{ id, promise }` + `ChoresProvider` helpers.
- Auth: `initializeAuth` + `browserLocalPersistence` + popup resolver (firebase-js-sdk#10264).
- Every chore needs `updatedAt` (list `orderBy`).
- Prefer **task** in UI; collection remains `chores`.
- Create chrome: bottom **Type a task…** only — no top Add.
- **PWA:** SW registers at app start (`PwaProvider`). Installed/standalone uses Google **redirect** auth (popup on desktop browser). Deploy on HTTPS (Netlify: `task.zeospec.com`); add the production domain under Firebase Auth authorized domains.
- **Push & Scheduled Functions:** set `VITE_FIREBASE_VAPID_KEY`; deploy `functions` via `firebase deploy --only functions` (`reminderTick` runs every 10 min, indexed by `nextReminderAt`). Frontend is deployed to Netlify via Git push. iOS needs Home Screen install. Brand in notifications: **ZeoTask**.
- **`ignoredTokens` type mismatch:** State stores `{text, kind}[]` for UI chips, but `parseSmartTitle()` expects `string[]`. Always `.map(t => t.text)` when calling the parser.
- **Modals inside Sidebar:** CSS `transform` on the sidebar drawer breaks `position: fixed` for any child modal. Must use `createPortal(modal, document.body)`.
- **Mobile viewport clipping:** On small screens (412px), `max-w-sm` (384px) + `px-4` (32px) = 416px which clips. Always pair `max-w-sm` with `w-full` so the smaller value wins.
- **Hover-only interactions don't work on mobile.** Never use `opacity-0 group-hover:opacity-100` for critical actions. Always visible.
- **`CreateTaskModal.reset()` must respect `initialOverrides`.** If `reset()` wipes project/label state unconditionally, overrides from InlineQuickAdd will be lost on modal open.
- **Never put un-gated Firestore writes in client `useEffect` on `chores`:** Updating documents in a `useEffect([chores])` changes `updatedAt`, which re-triggers `subscribeChores`, creating an infinite write loop that flickers the task list and floods Firestore. All migrations should happen server-side in Cloud Functions.
- **Deterministic Sort Tie-Breakers:** When sorting tasks by `dueAt`, tasks with identical due dates return `0` from `localeCompare`. Always provide deterministic tie-breakers (priority → title → id/createdAt) to prevent DOM flickering or list re-sorting when document timestamps update.
- **Scheduled Cloud Function Firestore Reads:** Never perform full collection scans `where('archivedAt', '==', null)` in recurring cron functions. Always index with `nextReminderAt: string | null` and query `where('nextReminderAt', '<=', nowIso)` to avoid massive repeated reads (~4.8K reads/day for 19 tasks). Decouple daily digests so they only read active chores once a day.
- **`useSearchParams` / React Router Functional Updates:** In `react-router-dom`, `setSearchParams(fn)` reads `searchParams` from the current render snapshot. Calling `setSearchParams` or `navigate` twice synchronously in the same handler (e.g. `handleSelectProject` followed by `handleSelectLabel(null)`) causes the second call to overwrite the first with stale state. Always perform multi-param URL updates atomically in a single navigation call.
- **Sidebar Drawer Portal & Pointer Events:** The Sidebar drawer is portaled to `document.body` to prevent stacking context or transform clipping, and must have `pointer-events-none` when `-translate-x-full` so hidden drawers do not intercept touch events.
- **Dev Mode Service Worker MIME Type Fallback:** When running Vite dev server locally, if the browser holds a stale production registration for `/sw.js` or Firebase Messaging requests `/firebase-messaging-sw.js`, Vite's default SPA middleware falls back to returning `index.html` (`text/html`), causing Chrome to log `The script has an unsupported MIME type ('text/html')`. A dev-only Vite middleware (`apply: 'serve'`) intercepts `/sw.js` and `/firebase-messaging-sw.js` to serve valid JS (`text/javascript`) and unregister stale workers.

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
- **2026-08-15:** Integrated Project and Label management directly into the Sidebar using `EntityManageModal`. Projects support custom colors (preset + native picker); Labels do not.
- **2026-08-15:** Enhanced PWA behavior: added permanent "Install App" block in Profile and global "Update Available" banner.
- **2026-08-15:** NLP overrides hardened: last-match-wins for priority/project/date; structured `CreateOverrides` flow from InlineQuickAdd → AppShell → CreateTaskModal; `reset()` preserves overrides; title stripping of `@project`/`#label` trigger tokens.
- **2026-08-15:** EntityManageModal rewritten: portals to `document.body` (fixes sidebar transform clipping on mobile), bottom-sheet on mobile / centered modal on desktop, custom color picker via `<input type="color">`.
- **2026-08-15:** Layout polish: sticky header with backdrop-blur mirroring bottom bar; send button (↑) in InlineQuickAdd appears when text is present.
- **2026-09-03:** Checklist tasks as unified tasks:
  - Added `dueAt?: string | null` to `Subtask`. Checklist items inherit parent `projectId`, `labelIds`, `priority`, and default to parent `dueAt`.
  - Added `expandChoresWithSubtasks` to represent uncompleted checklist items alongside parent tasks in agenda buckets and calendar view with breadcrumb indicator (`↳ [parentTaskTitle]`).
  - Added `EditSubtaskModal` for editing checklist item title, due date, completion, deletion, and linking to parent task.
  - Overhauled checklist adding UI: explicit "Add" button, due date chip, visual flash/feedback animation, and input focus retention.
  - Inline checklist editing in `CreateTaskModal` and `ChoreDetailPage`.
  - Fixed mobile menu clipping in `CreateTaskModal`: `Menu` renders as a responsive bottom sheet on mobile (`fixed inset-x-0 bottom-0 z-[70] max-h-[75dvh]`) and right-clamped popover on desktop (`align="right"`).
  - Added `{done}/{total}` numerical fraction text alongside progress bar in `ChoreRow`.
  - Added NLP natural language due date parsing (`parseSubtaskTitle`) for checklists with live detected date indicators in `CreateTaskModal`, `ChoreDetailPage`, and `EditSubtaskModal`.
  - Extended live NLP syntax highlighting to checklist items: upgraded `SmartTaskTitleInput` to support customizable typography, ref forwarding, escape handling, and rendered it across checklist draft inputs, inline edits, and edit modal.
  - Implemented inline double confirmation when deleting checklist items across all surfaces (`CreateTaskModal`, `ChoreDetailPage`, `EditSubtaskModal`) to prevent accidental deletion.
  - Performance & bundle optimization: route code-splitting with `React.lazy` (`ChoreDetailPage`, `CompletedPage`, `ProfilePage`), Rollup manual vendor chunking (`firebase`, `nlp-date`, `dnd`, `vendor`), and `React.memo` for `ChoreRow`. Initial bundle dropped from 1,153 kB to 142 kB.
- **2026-09-09:** Fixed Sidebar project click:
  - Eliminated race condition where `handleSelectProject` followed by `handleSelectLabel(null)` overwrote the URL search params due to stale render snapshots in `react-router-dom`.
  - Upgraded project and label selection in `AppShell` to perform single atomic navigation with options (`{ clearLabel: true }` / `{ clearProject: true }`).
  - Portaled `Sidebar` to `document.body` and added `pointer-events-none` when closed so off-screen drawers do not intercept touch/click events.
  - Subtask recurrence hygiene: in `completeChore`, subtasks reset `dueAt: null` alongside `completed: false` when parent recurs, preventing historical date traps.
  - Non-rolling recurrence catch-up: `nextDueAfterComplete` safely loops overdue non-rolling tasks up to the current date to eliminate repetitive completion backlog cycles.
  - Navigation & Deep Linking: Active projects and labels synchronize with URL search params (`?project=...&label=...`), enabling back/forward history and reload persistence. Added clickable label filtering in `Sidebar` and clearable badges in the `AppShell` header.
  - Contextual Views: `ChoresPage` reflects active project/label in its main heading (with color dot) and contextual empty states. `SearchOverlay` searches across all checklist items with direct breadcrumb highlighting.
- **2026-09-08:** Excessive Firestore read usage resolution:
  - Diagnosed 4.8K reads/day (~200 reads/hour) as coming from `reminderTick` Cloud Function performing full collection scans (`where('archivedAt', '==', null)`) on all active chores every 5 minutes (288 times/day).
  - Introduced `nextReminderAt: string | null` indexed field on `Chore`. Created `computeNextReminderAt` helper and maintained it across `buildPayload`, `updateChore`, `completeChore`, and `undoCompleteChore`.
  - Refactored `functions/src/index.ts`: switched schedule to `every 10 minutes` with a 30-minute grace window; replaced full scan with indexed query `where('nextReminderAt', '<=', nowIso).limit(50)`; decoupled morning digest so active chores are only read during the morning digest window once per day; prunes invalid FCM tokens automatically; includes one-time self-healing migration (`remindersMigratedV2`) for existing active chores.
  - Added user-level `hasPushTokens` sync in `src/lib/push.ts` to bypass chore checks completely when users have no push devices registered. Added self-healing client backfill in `useChores.tsx`.
  - Read usage projected to drop from ~4,896 reads/day to ~288–310 reads/day (~94% reduction).
- **2026-09-09:** Hardened All-Day Tasks & Google Calendar Permanent 2-Way Sync:
  - **All-Day Tasks (Native, no 11:59 PM timestamp):**
    - Chrono parser hour certainty (`!dueDateMatch.start.isCertain('hour')`) sets `isAllDay = true` and avoids forcing 23:59:59.
    - Added `isAllDay` to `Chore`, `Subtask`, `ChoreCompleteSnapshot`.
    - Added `formatDueDisplay`, `parseChoreDue`, and `isChoreOverdue` in `scheduler.ts`. All-day tasks due today remain in `Today` without turning overdue during the day.
    - Updated `DueDatePicker` with an `All-Day` toggle/chip and integrated into `CreateTaskModal`, `ChoreRow`, `ChoreDetailPage`, `InlineQuickAdd`, and `SearchOverlay`.
  - **Permanent 2-Way Google Calendar Integration:**
    - Dedicated secondary calendar `"ZeoTask"` isolating personal events and ensuring 100% deletion safety.
    - Built `src/lib/gcal.ts` (API client handling all-day dates `start: { date }`, 30-min timed slots `start: { dateTime }`, incremental sync, and full active event listing).
    - Built `src/lib/syncCoordinator.ts`:
      - **Mutex lock:** Guarantees at most 1 sync runs at any time, coalescing all concurrent triggers into a single follow-up pass. Zero overlapping sync errors.
      - **Outbound debounce (800ms) with flush-before-pull:** Local edits are committed to GCal before inbound pull runs, preventing lost updates.
      - **Anti-echo loop protocol:** Stores `extendedProperties.private.zeoTaskUpdatedAt = chore.updatedAt`. Inbound sync ignores matching reflections.
      - **Deletion symmetry & tombstones:** Deletions in GCal emit `status: "cancelled"`, deleting the task in ZeoTask. Deletions in ZeoTask delete the GCal event and register the event in tombstones (`gcalTombstones`) so it can never be resurrected. Full reconciliation fallback handles expired syncTokens (410).
      - **Token auto-refresh:** Silent token check before sync calls, auto-renewing short-lived tokens in the background.
    - Integrated with `useChores.tsx` (window focus & `visibilitychange` listeners). Added management card in `ProfilePage.tsx` with Connect, Active status, Sync Now, and Disconnect.
    - **Cloud Functions Companion (`functions/src/gcal.ts` & `functions/src/index.ts`):**
      - **Single Scheduler & Cost Optimization:** Zero additional Cloud Schedulers created. All GCal sync and token management runs inside the existing `reminderTick` job every 10 minutes.
      - **15-Minute Token Refresh Margin:** Google access tokens last 60 minutes. The server checks token expiration and proactively renews when `< 15 minutes` remain. With a 10-minute scheduler interval, this provides two guaranteed opportunities to catch and renew the token before it expires, eliminating edge-case expirations.
      - **Incremental Outbound Reads (0 Reads when Idle):** Outbound query uses `where('updatedAt', '>', integration.lastSyncedAt).limit(50)` so if no chores were modified in ZeoTask, exactly 0 documents are read from Firestore.
      - **Firestore as Single Source of Truth:** Changes from Google Calendar write directly to Firestore on the server; the frontend simply consumes Firestore via its standard real-time `onSnapshot` subscription without extra REST roundtrips.
      - **Rescheduled Event Push Notifications:** When an event is moved or edited in Google Calendar while ZeoTask is closed, `syncGCalForUser` updates the Firestore chore and recomputes `nextReminderAt`, guaranteeing subsequent FCM push notifications reflect the rescheduled time.
      - **Permanent OAuth Code Flow & Verified Fallback:** Exported `gcalExchangeCode` callable function to exchange GIS authorization code for permanent `refresh_token` and `access_token`, ensuring the user never has to re-authorize. In `ProfilePage.tsx`, fallback to Firebase Auth verified Google popup (`signInWithPopup`) with `login_hint: user.email` eliminates Google's Error 401: invalid_client when GIS client ID is not configured.
      - **Sub-second Webhook:** Exported `gcalWebhook` HTTP endpoint to handle Google Calendar watch push notifications instantly. Exported `gcalRefreshToken` and `gcalTriggerSync` callables for client invocation.
      - **Permanent Calendar ID Locking:** The secondary calendar's unique `calendarId` is stored in Firestore (`users/{uid}/integrations/googleCalendar.calendarId`). Renaming the calendar in Google Calendar UI never breaks sync because all API operations target `calendarId`. Reconnect checks for existing `calendarId` first to prevent duplicate calendars.
      - **Inbound Event Creation & Editing:** Events created directly in Google Calendar (no `zeoTaskId`) are automatically imported as new chores with due dates and all-day status intact. Edits to events in Google Calendar update local chores and recompute `nextReminderAt`.
      - **Subtasks (Checklist Tasks) 2-Way Sync:** Subtasks with explicit deadlines sync to Google Calendar as linked events (`↳ [Subtask Title] ([Parent Task Title])`). Subtasks without deadlines are embedded as interactive checklists (`[✓]`, `[ ]`) in the parent event's description. Subtask modifications, completions, and deletions in `useChores.tsx` and `ChoreDetailPage.tsx` enqueue the parent chore and delete subtask events if removed.
      - **Initial Setup Bootstrap & Parity:** When a user connects Google Calendar for the first time, `lastSyncedAt` is initialized to `null`. Both the client (`SyncCoordinator.triggerSync('initial-connect')`) and backend (`syncGCalForUser`) detect initial connect or full reconciliation and immediately push all existing active tasks with due dates (and subtasks with deadlines) to Google Calendar. Once complete, `lastSyncedAt` is stamped to transition seamlessly into cost-optimized delta mode.
      - **Anti-Echo Architecture:** Do NOT check `zeoTaskUpdatedAt === chore.updatedAt` to detect echoes; Google Calendar preserves custom extended properties during user edits in GCal. Instead, compare `chore.gcalLastSyncedAt && event.updated === chore.gcalLastSyncedAt`.
      - **Live SyncCoordinator Memory & Fallback:** `SyncCoordinator` maintains `cachedChores` populated by `useChores` snapshot updates. In `processRemoteEvent`, if a remote event has `zeoTaskId` but isn't present in memory, it performs a fallback `getDoc` lookup to prevent dropping remote changes.
      - **Completed Task Data Retention & Restore:** `completeChore` preserves `dueAt: nextDue ?? chore.dueAt` (never nulling out the scheduled date). Restoring a task in `CompletedPage` checks if `dueAt` is in the past or missing; if so, it schedules it to `new Date().toISOString()` (Today), guaranteeing immediate visibility in the Today list and Google Calendar.
      - **Completed Tasks Read Cost Optimization:** Decouple `subscribeChores` to query only active tasks (`where('archivedAt', '==', null)`), keeping active reads at ~20-50 forever. Paginate `/completed` with `where('archivedAt', '!=', null).orderBy('archivedAt', 'desc').limit(25)` to prevent hitting 1,000+ reads. Optionally compact cold history into monthly documents (`archives/YYYY-MM`).
      - **Chronological Sorting & Due Time Ordering:** Never use string `localeCompare` on `dueAt` strings; mismatched representations (e.g. UTC `Z` vs timezone offset `+05:30`) cause severe alphabetical ordering inversions. Always compare numerical epoch timestamps (`aTime - bTime`). All-day tasks default to `endOfDay` timestamp (23:59:59.999) so timed tasks with explicit earlier hours (e.g., 8:59 PM) strictly appear on top. Tasks with identical due timestamps tie-break on Priority (P1 Urgent > P2 High > P3 Medium > P4 Low > No priority), then title (alphabetical), then creation time.
      - **Google Calendar Completed Task Closed-Loop Architecture:**
        - **Keep & Gray Out (Default):** Completed tasks remain on Google Calendar prefixed with `✓ ` and colored Graphite Gray (`colorId: '8'`).
        - **Settings Toggle & Zero-Leftovers Sweep:** 1-click toggle in `/profile` to switch between `keep` and `remove`. Switching to `remove` automatically sweeps existing completed events from GCal and clears `gcalEventId`.
        - **Anti-Checkmark Stacking:** All inbound GCal event processing runs `cleanGCalTitle(summary)` (`/^[✓✔]\s*/`) to prevent `✓ ✓ Title` duplication.
        - **Explicit Color Reversion:** When restoring a completed task, send `colorId: ""` to explicitly instruct Google Calendar to wipe the gray override and inherit the calendar default.
        - **Recurring Task Event Splitting:** When completing a recurring task in `keep` mode, the existing event is patched with `✓ ` in gray at its completed date/time, a new GCal event is created for `nextDue`, and the chore's `gcalEventId` is pointed to the new occurrence.
        - **Permanent Deletion from `/completed`:** Permanent deletion passes `chore.gcalEventId` directly to `deleteTask`, recording a tombstone and immediately removing the event from Google Calendar.
      - **Causal Conflict Resolution & Anti-Soft-Rejection:** In `processRemoteEvent`, compare epoch timestamps (`choreUpdatedMs >= eventUpdatedMs`). If local task was modified more recently than the Google Calendar event, local task state wins and pushes to GCal. This eliminates soft rejections where editing a task title or moving due date was reverted by an echoing or slow-propagating remote event.
      - **Two-Way Notes / Description Sync:** ZeoTask `description` (task notes) and Google Calendar event `description` synchronize bidirectionally. `extractGCalDescription(eventDesc)` isolates user notes from the auto-generated checklist footer (`Checklist:\n...`), ensuring user notes are preserved and never lost in transit.
      - **Sync Event Listener Decoupling:** In `useChores.tsx`, listeners for `visibilitychange`, `window focus`, and periodic intervals reference `choresRef.current` with `[user]` dependency, preventing an infinite cascade of sync passes on every single local keystroke or task update.
      - **Modal Menu Stacking Context & Z-Index:** In `CreateTaskModal.tsx`, the `Menu` fullscreen backdrop `<button>` is set to `z-[60]`. The dropdown content container MUST use `sm:z-[70]` (matching mobile `z-[70]`). If set to `sm:z-30` or any value `< 60`, the invisible transparent backdrop sits *in front of* the dropdown options on desktop, swallowing mouse clicks, immediately triggering `onClose()`, and preventing users from selecting projects, labels, priority, or repeat settings.
      - **GCal Permanent Self-Healing & 401 Retry (Zero-Expiry Architecture):**
        - **Never mark `needsReauth: true` on standard 401:** Google access tokens expire naturally every 60 minutes. A 401 or expired token simply means the access token needs renewal. `pushSingleChore`, `handleCompleteChore`, and `executeFullPass` catch 401s, force a backend refresh via `getValidGCalAccessToken(uid, /* forceRefresh */ true)`, and retry the request once. Only if Google's OAuth endpoint explicitly returns `invalid_grant` (user revoked access in Google Account) is `needsReauth: true` ever recorded.
        - **No hard lockout on `needsReauth`:** `getValidGCalAccessToken` does not bail when `needsReauth` is set; it proactively calls `gcalRefreshToken({ forceRefresh: true })` using the permanent `refreshToken` in Firestore to heal itself automatically.
        - **Cloud Functions clears `needsReauth`:** When `getValidBackendToken`, `syncGCalForUser`, or `gcalExchangeCode` refresh or sync, they update Firestore with `needsReauth: false` and `lastAuthError: null`.
        - **Real-Time Subscription & Client Self-Healing:** `ProfilePage.tsx` listens to the integration document in real-time via `onSnapshot` and automatically attempts background renewal when `needsReauth` or `isGCalExpired` is detected, restoring "Active" status without user interaction.
- **2026-09-10:** Mobile & PWA Back Navigation, Overlay History & Reusable Modal Architecture:
  - **The Problem:** On mobile and standalone PWA, hardware back button or swipe-back gesture abruptly terminated the PWA instead of closing active modals, drawers, or navigating back through filter selections.
  - **Stack-Aware History Synchronization (`useModalBack.ts`):**
    - Pushes a dedicated history entry on modal mount/open.
    - Global `popstate` listener pops and closes the top-most modal when user swipes back or clicks browser Back.
    - When modal is closed via UI ('X' button, backdrop tap, Save/Cancel), calls `window.history.back()` if and only if `window.history.state?.modalId === idToRemove`. Uses `isProgrammaticBack` flag to swallow the resulting popstate event, preventing parent modals or underlying views from closing inadvertently.
    - Full nesting support: e.g. `DueDatePicker` inside `CreateTaskModal` or `EditSubtaskModal`. Swiping back dismisses the date picker first, leaving the task modal open; swiping back again dismisses the task modal.
  - **Unified Component Abstraction (`Modal.tsx`):**
    - Encapsulates `createPortal(..., document.body)` so modals never get clipped by parent CSS transforms (like `Sidebar` drawer).
    - Built-in body scroll lock, Escape key listener, responsive layout (bottom sheet with safe-area padding on mobile `items-end pb-[calc(1.25rem+env(safe-area-inset-bottom))]`, centered card on desktop `sm:items-center`), and automatic `useModalBack` registration.
    - Refactored `EntityManageModal.tsx` and `EditSubtaskModal.tsx` to use `<Modal>`.
    - Integrated `useModalBack` into `DueDatePicker.tsx`, `CreateTaskModal.tsx`, `SearchOverlay.tsx`, and `Sidebar.tsx`.
  - **Filter & Subpage Navigation (`AppShell.tsx`):**
    - Removed `{ replace: true }` from `handleSelectProject`, `handleSelectLabel`, and `handleFilterChange`. Selecting a project/label pushes to history, so phone back gesture steps backward to the previous view/All Tasks.
    - Sticky header dynamically renders an `ArrowLeft` (`←`) button when `!onHome`, providing universal 1-tap return from subpages (`/profile`, `/completed`).
    - Removed redundant in-page `← Tasks` links from `ProfilePage.tsx` and `CompletedPage.tsx`.
  - **Human-Readable Relatable URL Schema (`AppShell.tsx`):**
    - Switched project and label query parameters from cryptic Firestore document IDs (`?project=9ZkH83...`) to human-readable names (`?project=Rotaract`, `?label=urgent`).
    - Bidirectional resolution: `activeProject` and `activeLabel` match case-insensitively on `p.name` (with URL decoding) and retain fallback to `p.id` for backward compatibility with existing links or bookmarks.
    - Seamless entity renaming: editing a project or label name in `Sidebar` re-selects it with the updated name, instantly refreshing the URL.
  - **Comprehensive Click-Outside & Backdrop Dismissal:**
    - `useClickOutside.ts`: Reusable hook capturing global `pointerdown` events to dismiss dropdowns and popovers (`FilterMenu`, View selector, Account menu) whenever clicking anywhere outside.
    - Backdrop clipping fix: Sticky header with `backdrop-blur` previously trapped child `fixed inset-0` backdrops. `useClickOutside` guarantees clicks anywhere on the document (e.g. task list, whitespace) immediately dismiss open menus.
    - Modal outer click handling: Added `onClick={(e) => { if (e.target === e.currentTarget) onClose() }}` on outer container divs of `CreateTaskModal`, `DueDatePicker`, and `SearchOverlay` so clicking in outer padding/margins immediately dismisses the modal.
    - Portaled `CreateTaskModal` to `document.body` via `createPortal`.
- **2026-09-10:** Fixed Google Calendar Session Expiry & Permanent Self-Healing 2-Way Sync:
  - **Diagnosed Premature Flagging:** Eager 401 handling in `syncCoordinator.ts` immediately set `needsReauth: true` on standard 1-hour access token expiration. `getValidGCalAccessToken` had an unconditional `if (needsReauth) return null` check which prevented the client from ever using the permanent refresh token via Cloud Functions.
  - **Zero-Expiry Self-Healing Token Lifecycle:** `getValidGCalAccessToken(uid, forceRefresh)` transparently calls `gcalRefreshToken` whenever the token is expiring (< 10m), expired, or forced. Successful renewal clears `needsReauth: false` and `lastAuthError: null`. Token expiry on the client clock never stamps `needsReauth: true`.
  - **Single 401 Retry Loop:** `pushSingleChore`, `handleCompleteChore`, and `executeFullPass` catch 401s, force token refresh via Cloud Functions, and retry once. If Google returns `invalid_grant` during refresh, only then is `needsReauth: true` stamped.
  - **Real-Time Integration Subscription in `/profile`:** Replaced one-shot `getGCalIntegration` with `onSnapshot`. Added proactive background self-healing on page mount/listen.
  - **Preserved Refresh Tokens in Popup Auth:** Ensured `signInWithPopup` fallback preserves existing `refreshToken: gcalDoc?.refreshToken`. Added `waitForGoogleOAuth` to avoid GIS script race conditions.
  - **Backend Auto-Clear:** Cloud Functions (`reminderTick`, `getValidBackendToken`, `syncGCalForUser`, and `gcalExchangeCode`) clear `needsReauth: false` and `lastAuthError: null` on successful token renewal and sync. Added one-time 401 retry on backend inbound pull.
- **2026-09-10:** Coordinated PWA Exit Guard & Modal Back Architecture:
  - **The Problem:** In mobile and standalone PWA, an uncoordinated `usePwaExitGuard` was previously firing "Swipe back again to exit ZeoTask" whenever any modal or task edit view was closed, because `popstate` fired on `/` when the modal or task detail popped from history.
  - **Coordinated Single Dispatch Pipeline:**
    - `useModalBack.ts` manages the single central `popstate` listener for history pop events.
    - If `isProgrammaticBack` is active (modal closed via UI 'X', backdrop click, or Save/Cancel), the event is swallowed cleanly.
    - If `modalStack.length > 0` (user swiped back to close an open modal, sheet, or picker), `top.close()` is called and the event is consumed immediately—the exit guard is NEVER called.
    - Only when `modalStack.length === 0` and `isProgrammaticBack === false` does the centralized `exitGuardInterceptor` run.
  - **State-Based Exit Guard Detection (`usePwaExitGuard.ts`):**
    - Instead of unstable React ref path tracking (which was desynchronizing when React Router updated location on popstate), the exit guard checks `event.state?.__pwaRootGuard` synchronously from the browser's PopStateEvent.
    - When user navigates back from `/profile`, `/completed`, or `/?project=...` to All Tasks (`/`), the entry landed on is the guarded root entry (`event.state?.__pwaRootGuard === true`). The guard recognizes this as a clean return to the home screen and immediately returns without showing any toast.
    - The double-back exit guard ("Swipe back again to exit ZeoTask") triggers exclusively when the user pops *off* the guarded root entry (`!event.state?.__pwaRootGuard`) onto the bare base entry on `/` with zero modals open.
    - **Drawer History Transition in `Sidebar.tsx` & `AppShell.tsx`:** Selecting an entity (project, label, or completed) from the open Sidebar uses `{ replace: true }` to cleanly replace the drawer's modal history entry. This prevents orphaned drawer entries from being trapped under the filtered route, guaranteeing that 1 tap/swipe back from any project filter or subpage returns straight to All Tasks.
- **2026-09-11:** Whole-Day Activity & Ordinal Date Parsing Consistency:
  - **The Problem:** Stand-alone ordinals like "19th", "on the 19th", "by 25th" were completely ignored by chrono-node. Dates specified without times (like "today", "tomorrow", or "19th") were intermittently treated as midnight timestamps (`12:00 AM`), saved as UTC ISO strings (`T18:30:00.000Z` in GMT+5:30), formatted with artificial time strings ("Today · 12:00 AM" or "Today · 11:59 PM"), and marked prematurely overdue in the morning. Checklist subtasks also lost their `isAllDay` flag when expanded or edited.
  - **Ordinal NLP Parser (`src/lib/taskParsers.ts`):**
    - Added `ORDINAL_TIME_PATTERN` (`/\b(?:(?:on|by|due\s+on|due)\s+)?(?:the\s+)?([1-9]|[12][0-9]|3[01])(?:st|nd|rd|th)\b(?!\s+(?:floor|century|grade|place|rank))(?:\s+(?:at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?|(\d{1,2}):(\d{2})\s*(am|pm)?|(\d{1,2})\s*(am|pm)))?/gi`).
    - Resolves target days relative to the current calendar month; automatically rolls over to the next month if day < today.
    - If no time is explicitly provided, marks `isAllDay: true` and zeros the time component.
    - Intelligently merges with `chrono-node`: full chrono matches (e.g. "Sep 19th") take precedence, while partial bare-time chrono matches (e.g. "at 3pm") subsumed by ordinal phrases (e.g. "on 19th at 3pm") yield to the complete ordinal expression.
    - Preserves "last-match-wins" contract so users can override due dates by typing a new value at the end of the input.
    - Applied to both `parseSmartTitle` and `parseSubtaskTitle`.
  - **Scheduler & Overdue Computation (`src/lib/scheduler.ts`):**
    - Added universal `isChoreAllDay(chore)` helper: checks `chore.isAllDay`, date-only `yyyy-MM-dd` regex, or midnight (`00:00:00`).
    - `isChoreOverdue`: compares with `endOfDay(due)` for all-day tasks, preventing tasks from being marked overdue in the morning.
    - `formatDueDisplay`: renders clean "Today", "Tomorrow", "Sat, Sep 19" with zero "12:00 AM" noise.
    - `byDue`: sorts all-day tasks at the end of their respective day (`endOfDay`) so timed tasks appear earlier.
    - `moveDueToToday`: returns `yyyy-MM-dd` for all-day tasks.
  - **Firestore & Subtask Integrity (`src/lib/chores.ts`):**
    - `buildPayload` and `updateChore` automatically infer `isAllDay` using `isChoreAllDay`.
    - `expandChoresWithSubtasks` copies `isAllDay` to expanded subtasks in the task stream.
  - **Components & Modals Updated:**
    - `DueDatePicker.tsx`: Defaults `allDay` to `true` when date is null or midnight (`00:00:00`), and falls back to 9:00 AM (not 12:00 AM) if unchecking "All Day".
    - `InlineQuickAdd.tsx`: Saves all-day tasks with date-only `yyyy-MM-dd` and explicit `isAllDay: true`.
    - `CreateTaskModal.tsx`: Preserves `isAllDay` for editing and calendar date clicks; supports `isAllDay` across checklist subtask creation and editing; uses `formatDueDisplay` for subtasks.
    - `ChoreDetailPage.tsx`: Tracks `isAllDay` for subtask addition and inline edits; uses `parseChoreDue` and `formatDueDisplay`.
    - `EditSubtaskModal.tsx`: Replaced `23:59:59` hack with clean `format(..., 'yyyy-MM-dd')` and `isAllDay: true`; uses `formatDueDisplay`.
    - `CalendarView.tsx` & `CompletedPage.tsx`: Use `parseChoreDue` to eliminate timezone shifts on `yyyy-MM-dd` strings.
    - `gcal.ts`: `buildGCalEventPayload` and `buildGCalSubtaskPayload` use `isChoreAllDay` to consistently create Google all-day events (`{ date: 'yyyy-MM-dd' }`).
  - **Due Date Picker & Update Task Modal 12:00 AM Fix:**
    - Diagnosed root cause: `isChoreAllDay(chore)` checked `if (chore.isAllDay !== undefined) return chore.isAllDay` before inspecting date strings. Older chores created with `isAllDay: false` (or undefined in Firestore) retained `false` even if their due date was midnight (`00:00:00`) or `yyyy-MM-dd`. When opened in `CreateTaskModal` or `DueDatePicker`, `allDay` defaulted to `false` and initialized `timeHour` to `0` (12:00 AM), so clicking "Today" in Quick Date set `withTime` to `12:00 AM`.
    - Upgraded `isChoreAllDay`: always checks `/^\d{4}-\d{2}-\d{2}$/` and midnight (`00:00:00`) first before falling back to `chore.isAllDay`.
    - Safety guard in `formatDueDisplay`: even if `allDay` is somehow false, if time is `00:00:00`, it formats as clean "Today" / "Tomorrow" and never appends "12:00 AM".
    - Hardened `DueDatePicker`: initializes `allDay` to `true` if date is null or midnight; defaults `timeHour` fallback to `9` (Morning), never `0`; clicking Quick Date ("Today", "Tomorrow", etc.) or picking a calendar day switches to `allDay: true` unless an explicit non-zero time was activated; `summary` displays "Today · All-Day" or "Tomorrow · All-Day".
    - Hardened `CreateTaskModal`: `isAllDay` defaults to `true` when `dueAt` is midnight or unset; Due chip and Due pill display "Today" / "Tomorrow" cleanly; checklist subtask draft defaults to `isAllDay: true`.
    - Hardened `ChoreDetailPage` and `useChores`: preserved `isAllDay` across move-to-today mutations and checklist additions.
    - Fixed NLP typed date override when editing an activity with an existing date: In `CreateTaskModal`, `isAllDayOverride` was initialized to `isChoreAllDay(editing)` on open, which acted as an active manual override that blocked `parsed.isAllDay` when the user typed a new due date like "today" in the title. Initialized `isAllDayOverride` to `undefined` on modal open; prioritized `hasNlpDue` so live parsed NLP dates (`dueAt` and `isAllDay`) take precedence over stale existing activity dates; cleared `dueOverride` and `isAllDayOverride` whenever `onParsed` detects a due phrase; applied identical precedence to subtask draft and inline editing.
- **2026-09-11:** Simplified Mobile Back Navigation & Consistent Edge Swipe:
  - **Removed Exit Guard Entirely:** Removed double-back exit guard, toast notifications ("Swipe back again to exit ZeoTask"), and history guard trapping. The app now allows clean, natural, simplified browser back navigation without interceptors fighting the history stack.
  - **Closing Open Modals/Tasks/Drawers First:**
    - Any active modal (`CreateTaskModal`, `EditSubtaskModal`, `EntityManageModal`, `DueDatePicker`, `SearchOverlay`, `Sidebar`) intercepts the back gesture via `useModalBack` and closes itself immediately without popping routes.
    - Swiping back from subpages (`/chore/:id`, `/profile`, `/completed`) or filters (`/?project=...`, `/?label=...`) returns directly to the root task list.
  - **Consistent Left vs Right Swipe Navigation (`overscroll-behavior-x: none`):**
    - Mobile browsers (iOS Safari, Android Chrome) by default run a native horizontal page-slide animation on left-edge-to-right swipes, while right-edge swipes execute a clean back action. This caused an asymmetric "page shift" glitch on left swipes.
    - Added `overscroll-behavior-x: none` and `overflow-x: clip` to `html`, `body`, and `#root` in `src/index.css`. This completely suppresses the browser's horizontal swipe-to-navigate canvas shifting while preserving full vertical scrolling and sticky header positioning (`overflow-x: clip` does not break `position: sticky`).
    - Both left-edge and right-edge gestures now behave with identical, smooth consistency.
  - **Drawer Transition Suppression (`Sidebar.tsx`):**
    - Retained `swipeCloseInProgress` from `useModalBack.ts` so `transition-none` is applied when closing the drawer via swipe gesture, preventing dual-animation conflict.
