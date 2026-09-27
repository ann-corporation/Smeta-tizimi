# TIZIM_02 agent boot protocol

Before changing anything, read this chain in order:

1. `docs/governance/CONSTITUTION.md` — non-negotiable system rules.
2. `docs/governance/CURRENT_STATE.md` — replaceable, measured repository state.
3. `docs/governance/AGENT_COMMS_PROTOCOL.md` — how agents talk to each other:
   mailbox, handoff, status vocabulary, and the multi-machine rule. Laptop and
   office PC share exactly one line — the git remote. Unpushed work is not a
   message. Every mailbox file names its agent AND its machine.
4. `docs/governance/OWNER_AUTHORIZATION.md` and `docs/governance/AGENT_CAPABILITY_POLICY.md` — Owner standing authorization and role boundaries.
5. `ops/ACTIVE_TASKS.json` — task ownership, locks, dependencies and required reading.
6. `ops/mailbox/INBOX.md` — open items currently waiting on someone.
7. `ops/second-mind/README.md`, `PROJECT_MEMORY.json`, `DECISIONS.json` and `INDEX.json` — project memory, accepted decisions and evidence map. Read these before selecting implementation files.
8. Only the relevant accepted contract/ADR under `docs/architecture/` or review under `docs/reviews/`.
9. Owner's Obsidian vault (the human-readable bridge between Claude, Codex and every other agent): `D:\Obsidian\Anvar_Brain` on the laptop — read `80_SYSTEM/ai/AGENT_BRIDGE.md` and `20_PROJECTS/Smeta-tizimi/AGENT_LOG.md`. After every commit, deploy or owner decision, append one entry to AGENT_LOG and update CURRENT_STATE/HANDOFF/OPEN_ISSUES/TASKS (owner standing order, 2026-09-26). Agents on other machines that cannot see the vault use `ops/mailbox/INBOX.md` and the laptop agent mirrors it into the vault.

Run `node ops/governance-check.cjs` before handoff. A task may edit only paths in
its `owns` list. Do not use `tizim02/MULOQOT.md` as current state: it is an
append-only historical journal. The active Product Owner standing authorization
is recorded in `docs/governance/OWNER_AUTHORIZATION.md`: routine git work,
additive safe migrations, normal deployment and `main` integration do not need
repeated approval questions. Do not stop for routine permission bureaucracy.
Only the destructive/key-rotation/irreversible cases listed in that document
remain hard stops. Agent-specific limits are defined in
`docs/governance/AGENT_CAPABILITY_POLICY.md`; Antigravity is audit-first and
cannot touch production/backend/release boundaries. Record changes in the task
branch and leave unrelated worktree changes untouched.
