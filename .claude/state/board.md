# Board — Abyss CMS v1

Source: `tasks/todo.md` (full acceptance criteria) · Spec: `SPEC.md` (approved 2026-10-20) · Finished phases 0-4, Ad-hoc DB1 and the old log: `archive/board-archive.md`
Decisions: Q1 Kysely=yes · Q2 invite-only · Q3 TOTP + email OTP (warn) · Q4 CLIENT_IP_HEADER optional, unset by default · Q5 sensitive = reference.phone, company (root + experience), github, email (confirmed) · Q6 owner reviewer-session log reuses the audit log
UI decisions: palette A (slate + muted blue), system font stack, no dark mode in v1, button order secondary-left/primary-right (end-aligned)
Open risks: braces 3.0.3 high DoS advisory (build-only, via tailwind CLI/shadcn; no fix published) · sprintf-js moderate (dev-only)

## Phase 5: Media
Base: 3aba2ba · Phase checks: qc pass (e2e 73/73, per task) · security pass (per task) · Checkpoint: pending user review

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| T27 | Upload pipeline + Cloudinary adapter + list | apps/cms-api | done | d4a3394 |
| T28 | Safe delete + purge job | apps/cms-api | done | 854b479 |
| T29 | MediaInput + media library UI | apps/cms-admin, packages/form-commons | done | 9a33089 |

## Notes
- Phase 5 checks were run per task under the old flow; no phase-level REGRESSION / PHASE review was run. Ask the user at the checkpoint whether to run them now.
- T38: no checks (docs only, Risk normal). Builder ran the guide's commands against the smoke stack; cluster YAML, real Traefik/Cloudflare client IP, rclone, SOPS and readOnlyRootFilesystem untested (see the guide's "not run" list).

## Ad-hoc: Docs
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| D1 | Local run guide + k3s SOPS secret guide | docs | done | bfa3455 |

## Ad-hoc: Base config
Source: `tasks/todo.md` "Ad-hoc: Base config" (D2) · Order: core-builder (A) -> ui-builder (B) -> qc (C)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| D2 | Rename prettier-config to base-config (@abyss/base-config): prettier, eslint, oxlint exports for all apps and packages | core-builder, ui-builder, qc | done (steps A 76d9058, B 1018286; C qc pass) | 76d9058, 1018286 |

## Ad-hoc: Base config (D3)
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| D3 | Build @abyss/base-config to dist/ and export from dist (supersedes D2 Q-BC4) | core-builder | in-progress | - |
