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
