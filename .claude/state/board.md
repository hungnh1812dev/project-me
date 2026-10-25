# Board — Abyss CMS v1

Source: `tasks/todo.md` (full acceptance criteria) · Spec: `SPEC.md` (approved 2026-10-20) · Finished phases 0-4, Ad-hoc DB1, phases R1, R4 and the old log: `archive/board-archive.md`
Decisions: Q1 Kysely=yes · Q2 invite-only · Q3 TOTP + email OTP (warn) · Q4 CLIENT_IP_HEADER optional, unset by default · Q5 sensitive = reference.phone, company (root + experience), github, email (confirmed) · Q6 owner reviewer-session log reuses the audit log
UI decisions: palette A (slate + muted blue), system font stack, no dark mode in v1, button order secondary-left/primary-right (end-aligned)
Open risks: braces 3.0.3 high DoS advisory (build-only, via tailwind CLI/shadcn; no fix published) · sprintf-js moderate (dev-only) · body-parser, multer and fast-uri advisories (pnpm audit --prod; need a dependency-bump task)

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
| D3 | Build @abyss/base-config to dist/ and export from dist (supersedes D2 Q-BC4) | core-builder | done | 1713a2d |

## Ad-hoc: Root start scripts
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| S1 | Root start scripts: start:dev, start:cms-admin, start:web, start:cms-api | core-builder | done | c2c80a8 |

## Phase 8 (CI change): T37g
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| T37g | Remove e2e from CI; publish gated on app checks only | core-builder | done | 9afb986 |

## Ad-hoc: Format check fix
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| F1 | Ignore apps/e2e report output in prettier (format:check passes) | core-builder | done | b71cf76 |

## Ad-hoc: Owner setup
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| OS1 | Owner setup API (/setup/status, /setup/owner) + shared bootstrap audit | core-builder | done | c324e6b |
| OS2 | Admin /setup page + login notice | ui-builder | done | d4c929e |
| OS3 | Smoke stack creates owner via setup route; deploy and local docs | core-builder | done | a668623 |
| OS4 | e2e for closed state + browser check on fresh DB | qc (browser walk open, user) | done | 0d543d8 |

## Ad-hoc: Audit
Source: `tasks/todo.md` "Ad-hoc: Audit" (AU1a-AU6) · Read-only runs, findings in `.claude/state/findings/AUDIT-<area>.md` · Order: AU1a, AU1b, AU1c, AU2, AU3, AU4, AU5, then AU6

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| AU1a | Audit cms-api identity, access, reviewer, media | qc, security-qc | done (findings in AUDIT-AU1a.md, triage at AU6) | - |
| AU1b | Audit cms-api content-engine, content-types, documents, graphql | qc, security-qc | done (findings in AUDIT-AU1b.md, security merged; triage at AU6) | - |
| AU1c | Audit cms-api common, config, infrastructure | qc, security-qc | done (findings in AUDIT-AU1c.md, security merged; triage at AU6) | - |
| AU2 | Audit cms-admin | qc, security-qc | done (findings in AUDIT-AU2.md, security merged; triage at AU6) | - |
| AU3 | Audit web | qc, security-qc | done (findings in AUDIT-AU3.md, security merged; triage at AU6) | - |
| AU4 | Audit form-commons | qc, security-qc | done (findings in AUDIT-AU4.md, security merged; triage at AU6) | - |
| AU5 | Audit tooling and test code | qc, security-qc | done (qc 17 findings; security on -03 running) | - |
| AU6 | Consolidate findings, decide G6, propose R1-R4 | planner | done (user approved R1-R4) | - |
