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

## Hooks

| Hook | Purpose |
|------|---------|
| `useAuth.tsx` | Auth context + Google sign-in/out |
| `useChores.tsx` | CRUD + real-time Firestore subscription for tasks |
| `useLabels.tsx` | CRUD + subscription for labels |
| `useProjects.tsx` | CRUD + subscription for projects |
| `usePwa.tsx` | Install prompt, SW update detection |
| `useViews.tsx` | View-related state (agenda/week/month) |

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
- **PWA:** SW registers at app start (`PwaProvider`). Installed/standalone uses Google **redirect** auth (popup on desktop browser). Deploy on HTTPS (Firebase Hosting); add the production domain under Auth authorized domains.
- **Push:** set `VITE_FIREBASE_VAPID_KEY`; deploy `functions` (`reminderTick` every 5 min). iOS needs Home Screen install. Brand in notifications: **ZeoTask**.
- **`ignoredTokens` type mismatch:** State stores `{text, kind}[]` for UI chips, but `parseSmartTitle()` expects `string[]`. Always `.map(t => t.text)` when calling the parser.
- **Modals inside Sidebar:** CSS `transform` on the sidebar drawer breaks `position: fixed` for any child modal. Must use `createPortal(modal, document.body)`.
- **Mobile viewport clipping:** On small screens (412px), `max-w-sm` (384px) + `px-4` (32px) = 416px which clips. Always pair `max-w-sm` with `w-full` so the smaller value wins.
- **Hover-only interactions don't work on mobile.** Never use `opacity-0 group-hover:opacity-100` for critical actions. Always visible.
- **`CreateTaskModal.reset()` must respect `initialOverrides`.** If `reset()` wipes project/label state unconditionally, overrides from InlineQuickAdd will be lost on modal open.

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

