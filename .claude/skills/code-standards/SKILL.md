---
name: code-standards
description: Project code rules - run Prettier after every finished feature and before any commit, no hardcoded values, never guess (ask instead). Use whenever writing or changing code in this project.
---

# Code Standards

## 1. Prettier after every finished feature

Run this before proposing a commit, every time:

1. Use the project's script if there is one (`format` / `prettier` in the root or package `package.json`), run with the package manager that matches the lockfile (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun, `package-lock.json` → npm).
2. Otherwise run Prettier on the changed files only: `<pm> exec prettier --write <files>`.
3. If Prettier is not set up in the project at all, **ask** (via a `blocked` report) before adding it or a config. Do not invent a config.
4. Then run lint and type-check if the project has them.

## 2. No hardcoding

Never write these as literals in the code:

| Kind | Where it belongs |
|---|---|
| URLs, ports, hosts, API keys, feature flags | env config, read through one typed config module; key names documented in `.env.example` |
| Colors, spacing, radii, shadows, font sizes | design tokens / theme (CSS variables or Tailwind theme) |
| User-facing text | the project's i18n / copy module, if there is one; otherwise ask how copy should be handled |
| Magic numbers (limits, timeouts, page sizes) | named constants in a constants / config module |
| Routes, API paths | one route / endpoint map |
| Mock or sample data | test fixtures only, never in production code paths |

Allowed: `0`, `1`, `-1`, empty string, and literals that are obviously self-describing in context (e.g. array index math).

## 3. Never guess. Ask.

If any of these is unclear, stop and ask (the worker reports `blocked`, the manager asks the user):

- Requirement or acceptance-criterion ambiguity
- Naming of public APIs, routes, DB fields
- Design values that are not already in the tokens
- Library or framework choice not already in the repo
- Env values, credentials, third-party endpoints
- Whether to delete or rename existing code

Give options and a recommendation with the question so the user can answer fast.

## 4. General

- Match the surrounding code's style, naming, and comment density.
- Stay in the task's scope. No drive-by refactors.
- Never read or edit `.env*` files (except `.env.example`).
