# Board archive: Phase DV (closed 2026-10-25)

## Phase DV: cms-api local start
Base: 3b74d2d · Phase checks: qc pass (regression 189 e2e on full stack) · security pass (dynamic + audit; 6 pre-existing advisories, separate follow-up) · Checkpoint: approved 2026-10-25

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| DV1 | cms-api `start:dev` reads `.env.local` (Node `--env-file-if-exists`), DV2 root scripts folded in | core-builder | done (checks none: dev tooling and docs, Risk normal) | b3fbc13 |
| DV1b | Reopened: cms-api `start:dev` uses the NestJS CLI standard watch config (user request), `.env.local` still loaded | core-builder | done (checks none: dev tooling and docs, Risk normal) | 5c50f23 |
| DV1c | cms-api uses the NestJS CLI build, start and tsconfig defaults (ADR 0009) | core-builder | done (qc-cli pass: docker build, smoke+e2e 189, start:debug) | 38647bb |
