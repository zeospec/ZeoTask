# AGENTS.md

Guidance for AI coding agents in **ZeoTask**.

## Startup (required)

1. Read [`MEMORY.md`](./MEMORY.md).
2. Read [`.agent/`](./.agent/) — especially `00-settled-decisions.md` and `05-next-session.md`.
3. Prefer those notes over chat history assumptions. If notes conflict with code, trust the code and update the notes.

## Continuous memory updates

Whenever you learn something durable, update `MEMORY.md` and (when structural) `.agent/` in the same session:

- Commands that work
- Schema / rules / Firebase non-secret project id
- Gotchas and “do not do X”
- Phase progress

Never store API keys, tokens, or passwords.

## Working agreements

- Solo personal app — no circles/assignees.
- Firestore-native offline; no Dexie/RxDB sync engines.
- Tailwind only. No Capacitor. No Next.js.
- Domain scheduling in `src/lib/` (client-side for offline).
- Do not commit unless the user asks.
