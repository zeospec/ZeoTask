# Design System: ZeoTask

**Product:** Solo personal tasks PWA — calm daily use, keyboard + touch.  
**Role of this doc:** North star for atmosphere and product intent. Not a locked component catalog.

**Shipped visual:** Mineral forest green. Tokens live in `src/index.css`.

---

## 1. Visual theme & atmosphere

ZeoTask should feel **quiet, capable, and human** — soft density, clear completion, create → list → complete as one gesture language.

Reference *feel*: Things 3, Linear, Apple Reminders — calm hierarchy, sharp feedback.

---

## 2. Color (shipped roles)

| Role | Token | Value |
|------|--------|--------|
| Canvas | `--canvas` | `#F9F9F8` |
| Surface | `--surface` | `#FFFFFF` |
| Quiet wash | `--quiet` | `#EEF0EC` |
| Ink | `--ink` | `#27313A` |
| Muted | `--muted` | `#6F6E68` |
| Hairline | `--hairline` | `#E6E5E1` |
| Primary | `--accent` | `#315F55` |
| Primary pressed | `--accent-pressed` | `#274C44` |
| Primary wash | `--accent-wash` | `#E5ECE7` |
| Complete | `--completed` | `#315F55` |
| Due soon | `--due-soon` | `#A85B00` |
| Danger | `--danger` | `#B84C43` |

Accent is rare — primary actions, focus, NLP chips. Not on every row.

---

## 3. Typography

- UI: **Inter Tight** (`--font-sans`)
- Meta / times / counts: **JetBrains Mono** (`.font-mono-meta`)

---

## 4. Interaction principles (hard)

1. **Completion is unmistakable** — large circle with hover/press/focus.
2. **Hover and focus exist** — `.focus-ring` on interactive controls.
3. **Create is frictionless** — bottom **Type a task…** only (no top Add, no side Add button). Shortcuts: `C` / `N` / `⌘K` / `⌘N`.
4. **Edit and delete are reachable** — delete needs confirmation.
5. **Notes and checklist belong together** — one task body in create/edit.
6. **Motion explains outcomes** — complete, undo, modal; respect reduced motion.
7. **Empty space is intentional** — Daily Complete–style empty when the list is clear.

---

## 5. Layout

- One primary column (~680px); Smart list buckets (not Morning/Upcoming time blocks).
- Soft bordered white **task cards** for rows.
- Brand lockup: ZeoMark + ZeoTask in shell header; profile avatar for hub.
- Mobile-first; safe areas on composer.

---

## 6. What to avoid

- Top “Add task” / solid green bar-as-composer
- Focus rails, View schedule, Activity feeds
- Unicode chrome standing in for icons
- Cobalt / purple-glow / teal-everywhere leftovers

---

*Implementation checklist: `docs/plans/2026-08-13-001-visual-revamp-plan.md`. Longer external brief (historical): `DESIGN_BRIEF.md`.*
