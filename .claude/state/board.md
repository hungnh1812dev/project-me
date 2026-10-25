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

## Phase CA: cms-api clean-architecture audit
Source: `tasks/todo.md` "Architecture and navigation" · ADR `docs/adr/0006-cms-api-clean-architecture-layers.md` · Base: 38647bb · Phase checks: qc pending · security pending · Checkpoint: pending

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| CA1a | Audit identity and security-audit (layers L1-L8) | qc, security-qc | done (qc findings in AUDIT-CA1a.md; security pass after fix round 1; commit pending user) | - |
| CA1b | Audit access core, management, document auth | qc, security-qc | done (AUDIT-CA1b.md; security pass after fix round 2; expired-token fix routed to planner; commit pending user) | - |
| CA2 | Audit reviewer and media | qc, security-qc | done (AUDIT-CA2.md; security pass after fix round 2; commit pending user) | - |
| CA3 | Audit documents, graphql, content-types, health | qc | done (AUDIT-CA3.md; qc only; commit pending user) | - |
| CA4 | Audit content-engine and platform | qc | done (AUDIT-CA4.md; qc only; commit pending user) | - |
| CA5 | Consolidate CA findings, write CR refactor tasks | planner | done (CR list approved 2026-10-25) | - |

## Phase SM: cms-admin side menu
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| SM1 | Nav sections in the feature contract | ui-builder | todo | - |
| SM2 | Content-type nav items from the catalog | ui-builder | todo | - |
| SM3 | Side-menu layout | ui-builder | todo | - |
| SM4 | e2e for the side menu | qc | todo | - |

## Phase FN: file naming rule
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| FN1 | SPEC §5 naming rule and per-package guards (split FN1a/b/c when scheduled) | core-builder | blocked: user confirms ADR 0008 | - |

## Phase MF: micro-frontends
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| MF0 | User picks the micro-frontend option (ADR 0007) | user | blocked: decision | - |

## Direct request: ET (expired API tokens)
Source: `tasks/todo.md` "Direct request: expired API tokens are not editable (ET)" · Answers in `handoff.md` Direct requests

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| ET1 | cms-api rejects PATCH on an expired token (409 API_TOKEN_EXPIRED), shared expiry rule | core-builder | done | 5db0108 |
| ET2 | cms-admin hides Edit on expired tokens, handles API_TOKEN_EXPIRED | ui-builder (qc e2e included; manual console/network/design walk not done) | done | 83cb2a6 |
| ET3 | e2e for the expired-token edit conflict (list refetch and Expired row after the 409) | qc | done | 1988376 |

## Phase CR: cms-api clean-architecture refactor
Source: `tasks/todo.md` "Phase CR" (approved 2026-10-25) · Plan: `tasks/plan.md` CR0-CR7 · Decisions: ADR 0006 §7 · Audit files `.claude/state/findings/AUDIT-CA*.md` kept until CR-cl-1 · Base: 1988376 · Phase checks: pending · Checkpoint: CR1 passed (2026-10-25)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| CR-pf-1 | DomainError, describeError and kind-to-status table | core-builder (gate) | done | ba1df5a |
| CR-pf-2 | Layer-aware import graph and pinned-path table | core-builder (gate) | done | e2c5e05 |
| CR-pf-3 | LAYER_RULES and the layer guard | core-builder | done | 78cc452 |
| CR-pf-4 | Platform splits and AppLogger port | core-builder | done | cdad48d |
| CR-pf-5 | TransactionRunner port and Prisma runner (rework: synchronous-only callbacks, ADR 0006 §7.12) | core-builder (gate) | done | 86df4cb, 44339a7 (rework) |
| CR-pf-6 | Domain constants for Prisma enums | core-builder (gate) | done | 230f6c0 |
| CR-00 | SPEC §2/§5 for the layer layout | planner | done | 419bac3 (SPEC.md; includes the earlier ET5 §7 D5 text) |
| CR-hc-1 | health in layers (warm-up) | core-builder | done | bcc96d0 |
| CR-hc-2 | content-types pilot in layers, then user checkpoint | core-builder | done (qc pass; CR1 user check-in pending) | f252559 |
| CR-ce-1 | content-engine domain moves | core-builder | done (qc pass) | 3e58fe8 |
| CR-ce-2 | content-engine ports, adapters and content transaction runner | core-builder (gate) | done (security pass, qc pass) | 5ed2ff5 |
| CR-dc-1 | documents domain and http moves | core-builder (gate) | done (security pass, qc pass) | 0228f1e |
| DEV-STACK | `pnpm dev:stack` for tier 2 e2e (own compose project, no smoke touch) | core-builder | todo (awaits approval of planner REVISE) | - |
| CR-gq-1 | graphql http moves | core-builder | todo | - |
| CR-dc-2 | documents repository, presence and activity ports | core-builder (gate) | todo | - |
| CR-dc-3 | documents use cases with DomainError, Clock, TransactionRunner; 404 DOCUMENT_NOT_FOUND (planned change) | core-builder (gate) | todo | - |
| CR-gq-2 | graphql application layer | core-builder | todo | - |
| CR-ac-1 | access core domain | core-builder (gate) | todo | - |
| CR-ac-2 | access core application and adapters | core-builder (gate) | todo | - |
| CR-ac-3 | access core DomainError swap | core-builder (gate) | todo | - |
| CR-ac-4 | access core http and document-auth sub-module | core-builder (gate) | todo | - |
| CR-sa-1 | security-audit with AuditLogWriter port | core-builder (gate) | todo | - |
| CR-id-1 | identity domain and constants split | core-builder (gate) | todo | - |
| CR-id-2 | token, OTP and TOTP behind ports | core-builder (gate) | todo | - |
| CR-id-3 | sign-in, password and 2FA use cases with DomainError | core-builder (gate) | todo | - |
| CR-id-4 | identity http, JWT strategy split, owner setup and CLIs | core-builder (gate) | todo | - |
| CR-ac-5 | access management domain, application and adapters | core-builder (gate) | todo | - |
| CR-ac-6 | access management http and role seeds | core-builder (gate) | todo | - |
| CR-md-1 | media domain and http | core-builder (gate) | todo | - |
| CR-md-2 | media upload pipeline split | core-builder (gate) | todo | - |
| CR-md-3 | media library use cases, storage port (infrastructure/media moves in), purge job | core-builder (gate) | todo | - |
| CR-rv-1 | reviewer domain and http | core-builder (gate) | todo | - |
| CR-rv-2 | reviewer application, adapters and cleanup job (infrastructure/turnstile moves in) | core-builder (gate) | todo | - |
| CR-cs-1 | consolidate health + content-types (behavior-preserving; pinned paths, docs, test imports) | core-builder | todo (awaits approval) | - |
| CR-cs-2 | consolidate platform files of CR-pf-1..6 (common/, infrastructure/, architecture/) | core-builder | todo (awaits approval) | - |
| CR-cs-3 | consolidate content-engine | core-builder (Security gate: yes) | todo (awaits approval) | - |
| CR-cl-1 | close: contract imports, ownership guard, transitional helpers removed | core-builder | todo | - |

## Notes
- Planner open questions Q-MF1..3, Q-CA1..4, Q-FN1..6, Q-SM1..4, Q-DV1..2 are waiting for the user (see `tasks/todo.md` / ADRs).
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
