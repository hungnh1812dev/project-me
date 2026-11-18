---
name: local-env
description: Where agents keep local dev values (`.localEnv.agent`, never `.env*`), that every change affecting a database needs the user's yes first, and how they commit in scratch git copies without changing the repo identity. Project-agnostic. Preloaded by the builders, qc and security-qc.
---

# Local Env

## Env files and `.localEnv.agent`

No agent reads or writes `.env*` files (except `.env.example`). Local dev values go in `.localEnv.agent` at the repo root:
- dev-only throwaway values (generated secrets, local URLs, test keys); real secrets and production values come from the user;
- before creating it: `git check-ignore -q .localEnv.agent` succeeds and any `.dockerignore` (or image build ignore file) lists it; otherwise a builder adds the ignore lines and records it, qc and security-qc report `blocked`;
- never `git add` it, copy it into an image, or print its values;
- key names only go in the matching `.env.example`;
- builders, qc and security-qc create, read and edit it, and add missing dev-only values there without asking the user (qc and security-qc note who, when and why on each change); security-qc reports a finding if it is tracked or holds a value that looks real.
- qc and security-qc have full read and write permission on it (user decision); they work from it only (the e2e owner login values live there); any edit carries a note so other agents do not overwrite it.

## Database changes (user decision)

Ask the user before adding, changing or deleting anything that affects a database, in any environment, local included:
- schema, migration, index, constraint, entity or model field mapped to a table;
- seed or fixture scripts, DB config, `DB_*` keys, connection or pool settings;
- data: drop, truncate, reset, restore, bulk insert, update or delete, removing a DB volume, running or reverting a migration by hand.

No channel to the user: stop that part and report `blocked` with the exact change, why it is needed, options and your recommendation; the manager asks. Go on only when the answer is in `handoff.md`, and only within it. Not covered: starting or stopping a stack with the `project.md` commands, and data the app writes through its own API or UI while you test.

## Git in scratch copies

A worktree shares the repo's `.git/config`, so `git config` inside it changes the identity of every later commit in the repo.
- Never run `git config` (any scope) in the repo or in a worktree of it.
- A test commit in a scratch copy: `git -c user.name=agent -c user.email=agent@localhost commit ...`.
- Remove a scratch worktree with `git worktree remove <path>` before you report.
