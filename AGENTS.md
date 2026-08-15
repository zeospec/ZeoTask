# AGENTS.md

Guidance for AI coding agents working on **ZeoTask**.

## Startup (required)

1. Read [`MEMORY.md`](./MEMORY.md).
2. Read [`DESIGN.md`](./DESIGN.md) to understand the visual language and architecture.
3. Prefer these notes over chat history assumptions. If notes conflict with code, trust the code and update the notes.

## Continuous memory updates

Whenever you learn something durable, update `MEMORY.md` in the same session:

- Schema or rules logic
- Workflows that have been successfully deployed
- Gotchas, edge cases, and "do not do X" rules
- Phase progress

Never store API keys, tokens, or passwords.

## Working agreements

- Solo personal app — no circles, assignees, or enterprise logic.
- Firestore-native offline; no Dexie/RxDB sync engines.
- Tailwind only. No Capacitor. No Next.js.
- Domain scheduling lives in `src/lib/` (client-side for offline).
- **NEVER** commit or push without asking first. Only after explicit user approval should you commit and push code.

## Architecture patterns (critical)

### Data flow: InlineQuickAdd → AppShell → CreateTaskModal

When the user types in the bottom bar (`InlineQuickAdd`) and clicks `+` to expand:

1. `InlineQuickAdd.onExpand(rawTitle, overrides)` fires with a `CreateOverrides` object containing `{ projectId, manualLabels, ignoredTokens }`.
2. **`AppShell`** receives both arguments and passes them to `openCreate(initialDue, title, overrides)`.
3. `CreateTaskModal` receives `initialOverrides` as a prop and uses it in its `reset()` function.
4. **All three layers must forward the overrides.** Forgetting any layer (e.g., AppShell dropping `overrides`) silently loses the user's project/label selections.

### NLP parsing: `taskParsers.ts`

- `parseSmartTitle(text, ignoredTokens?)` returns `{ title, due, priority, frequency, highlights, labels, projects }`.
- `ignoredTokens` parameter is `string[]` — if you have `{text, kind}[]` objects, **map to `.text`** before passing.
- **Last-match-wins:** priority, project, and due date all pick the *last* match in the text (not the first). This is so users can override by typing a new value.
- Date parsing uses `chrono-node` with reverse search: `[...parsed].reverse().find(...)`.

### Modals inside transformed parents

- Any modal rendered inside a component that uses CSS `transform` (like the Sidebar's slide drawer) will have its `position: fixed` broken.
- **Always use `createPortal(modal, document.body)`** for modals that need to escape transformed ancestors.
- The `EntityManageModal` uses this pattern; follow it for any future modals rendered from the Sidebar.

### Mobile-first modal layout

- Use `items-end` (bottom-sheet) on mobile, `sm:items-center` (centered) on desktop.
- Always add `backdrop-blur-sm` + click-outside-to-dismiss on the backdrop.
- Never use `max-w-sm` without also having `w-full` — on a 412px viewport, 384px + padding can clip.

## UX rules (learned from user feedback)

- **Sidebar edit buttons must be always visible** — never hover-only (`opacity-0 group-hover:opacity-100`), because mobile has no hover. Use vertical triple-dot icon, not horizontal.
- **Header is sticky** — `sticky top-0` with `bg-[var(--canvas)]/95 backdrop-blur`, mirrors the bottom bar treatment.
- **Send button appears on text input** — The InlineQuickAdd shows an accent-colored up-arrow (↑) submit button when the user has typed text, alongside the `+` expand button.
- **NLP chips strip from title on expand** — When user selects `@project` or `#label`, the trigger text is removed from the title string and passed as structured overrides, not left as raw text.
- Projects support custom colors via native `<input type="color">` in `EntityManageModal`.
